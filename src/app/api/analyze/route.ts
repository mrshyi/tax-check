import { NextResponse } from "next/server";
import { analyzeTaxInput, mergeParsedInputs } from "@/lib/tax/calculator";
import { sampleAnalysis, sampleParsedInput } from "@/lib/tax/sample-data";
import { parseFutuWorkbooks, type ManualCostInput } from "@/lib/parsers/futu";
import { parseLongbridgePdfs } from "@/lib/parsers/longbridge";
import { ParserValidationError } from "@/lib/parsers/common";
import type { ParsedInput, RealizedTrade } from "@/lib/tax/types";

export const runtime = "nodejs";

type BrokerId = "futu" | "longbridge";

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function parseBroker(value: FormDataEntryValue | undefined, fileName: string): BrokerId {
  const broker = String(value ?? "");
  if (broker === "futu" || broker === "longbridge") return broker;
  throw new ParserValidationError(`请为 ${fileName} 选择券商。`, fileName);
}

function exclusionKey(trade: Pick<RealizedTrade, "broker" | "currency" | "symbol">) {
  return `${trade.broker}::${trade.currency}::${trade.symbol}`;
}

function parseExclusionKeys(value: FormDataEntryValue | null) {
  if (!value) return new Set<string>();
  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set<string>();
  }
}

function parseManualCosts(value: FormDataEntryValue | null): ManualCostInput[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        id: String(item?.id ?? ""),
        costBasis: Number(item?.costBasis),
      }))
      .filter((item) => item.id && Number.isFinite(item.costBasis) && item.costBasis >= 0);
  } catch {
    return [];
  }
}

function applyExclusions(input: ParsedInput, excludedKeys: Set<string>): ParsedInput {
  if (excludedKeys.size === 0) return input;
  return {
    ...input,
    realizedTrades: input.realizedTrades.map((trade) => {
      if (!excludedKeys.has(exclusionKey(trade))) return trade;
      return {
        ...trade,
        excluded: true,
        exclusionReason: "用户在页面选择剔除该标的。",
      };
    }),
  };
}

export async function GET(request: Request) {
  const excludedKeysParam = new URL(request.url).searchParams.get("excludedSymbols");
  const excludedKeys = parseExclusionKeys(excludedKeysParam);
  if (excludedKeys.size > 0) {
    return NextResponse.json(analyzeTaxInput(applyExclusions(sampleParsedInput, excludedKeys)));
  }
  return NextResponse.json(sampleAnalysis);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const password = String(formData.get("password") ?? "");
    const files = formData.getAll("files").filter((item): item is File => item instanceof File);
    const brokerValues = formData.getAll("brokers");
    const excludedKeys = parseExclusionKeys(formData.get("excludedSymbols"));
    const manualCosts = parseManualCosts(formData.get("manualCosts"));

    if (files.length === 0) {
      return NextResponse.json(sampleAnalysis);
    }
    if (brokerValues.length !== files.length) {
      return errorResponse("每个上传文件都必须选择券商。");
    }

    const futuInputs: Array<Promise<{ name: string; data: ArrayBuffer }>> = [];
    const longbridgeInputs: Array<Promise<{ name: string; data: ArrayBuffer }>> = [];

    for (const [index, file] of files.entries()) {
      const broker = parseBroker(brokerValues[index], file.name);
      const lower = file.name.toLowerCase();
      if (broker === "futu") {
        if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
          return errorResponse(`${file.name} 被标记为富途，但富途解析器只接受 Excel 年度报表。`);
        }
        futuInputs.push(file.arrayBuffer().then((data) => ({ name: file.name, data })));
      } else {
        if (!lower.endsWith(".pdf")) {
          return errorResponse(`${file.name} 被标记为长桥，但长桥解析器只接受 PDF 月结单。`);
        }
        longbridgeInputs.push(file.arrayBuffer().then((data) => ({ name: file.name, data })));
      }
    }

    const parsedInputs: ParsedInput[] = [];
    if (futuInputs.length > 0) {
      parsedInputs.push(parseFutuWorkbooks(await Promise.all(futuInputs), manualCosts));
    }
    if (longbridgeInputs.length > 0) {
      const longbridgeInput = await parseLongbridgePdfs(await Promise.all(longbridgeInputs), password);
      const blocking = longbridgeInput.issues.find((issue) => issue.severity === "blocking");
      if (blocking) return errorResponse(`${blocking.title}：${blocking.detail}`);
      parsedInputs.push(longbridgeInput);
    }

    const merged = applyExclusions(mergeParsedInputs(parsedInputs), excludedKeys);
    const analysis = analyzeTaxInput(merged);
    return NextResponse.json(analysis);
  } catch (error) {
    if (error instanceof ParserValidationError) {
      return errorResponse(error.source ? `${error.source}：${error.message}` : error.message);
    }
    throw error;
  }
}

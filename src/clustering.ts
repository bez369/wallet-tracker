import { config } from "./config";
import { DetectedTrade, MintHistoryEntry } from "./types";

export interface TradeClusterContext {
  id: string;
  memberCount: number;
  entryNumber: number;
  secondsSincePrevEntry: number | "";
  startTimestampSec: number | null;
}

interface WorkingCluster {
  id: string;
  mint: string;
  startTimestampSec: number;
  lastTimestampSec: number;
  memberCount: number;
  entryNumber: number;
}

function getBuyClusterIds(history: MintHistoryEntry[]): string[] {
  const ids: string[] = [];
  for (const entry of history.filter((item) => item.action === "BUY")) {
    const id = entry.decisionClusterId ?? entry.signature;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function assignTradeClusters(
  trades: DetectedTrade[],
  historyByMint: (mint: string) => MintHistoryEntry[]
): Map<string, TradeClusterContext> {
  const contexts = new Map<string, TradeClusterContext>();
  const working = new Map<string, WorkingCluster>();
  const sorted = [...trades].sort((a, b) => a.timestampSec - b.timestampSec || a.signature.localeCompare(b.signature));

  for (const trade of sorted) {
    if (trade.action !== "BUY") {
      contexts.set(trade.signature, { id: "", memberCount: 0, entryNumber: 0, secondsSincePrevEntry: "", startTimestampSec: null });
      continue;
    }

    const history = historyByMint(trade.mint);
    const priorBuys = history.filter((entry) => entry.action === "BUY");
    const priorClusterIds = getBuyClusterIds(history);
    const current = working.get(trade.mint);
    let previousBuy: WorkingCluster | null = current ?? null;
    if (!previousBuy && priorBuys.length > 0) {
      const lastPriorBuy = priorBuys[priorBuys.length - 1];
      const priorClusterId = lastPriorBuy.decisionClusterId ?? lastPriorBuy.signature;
      previousBuy = {
        id: priorClusterId,
        mint: trade.mint,
        startTimestampSec: lastPriorBuy.decisionClusterStartTimestampSec ?? lastPriorBuy.timestampSec,
        lastTimestampSec: lastPriorBuy.timestampSec,
        memberCount: priorBuys.filter((entry) => (entry.decisionClusterId ?? entry.signature) === priorClusterId).length,
        entryNumber: priorClusterIds.indexOf(priorClusterId) + 1,
      };
    }

    const joins = previousBuy !== null
      && trade.timestampSec - previousBuy.lastTimestampSec <= config.entryClusterGapSec
      && trade.timestampSec - previousBuy.startTimestampSec <= config.entryClusterMaxSpanSec;

    let cluster: WorkingCluster;
    if (joins && previousBuy) {
      cluster = {
        id: previousBuy.id,
        mint: trade.mint,
        startTimestampSec: previousBuy.startTimestampSec,
        lastTimestampSec: trade.timestampSec,
        memberCount: previousBuy.memberCount + 1,
        entryNumber: previousBuy.entryNumber,
      };
    } else {
      cluster = {
        id: trade.signature,
        mint: trade.mint,
        startTimestampSec: trade.timestampSec,
        lastTimestampSec: trade.timestampSec,
        memberCount: 1,
        entryNumber: priorClusterIds.length + 1,
      };
    }

    working.set(trade.mint, cluster);
    const entryNumber = cluster.entryNumber;
    const previousClusterId = priorClusterIds[priorClusterIds.length - 1];
    const previousEntryTimestamp = priorBuys.find(
      (entry) => (entry.decisionClusterId ?? entry.signature) === previousClusterId
    )?.decisionClusterStartTimestampSec ?? priorBuys.find(
      (entry) => (entry.decisionClusterId ?? entry.signature) === previousClusterId
    )?.timestampSec;

    contexts.set(trade.signature, {
      id: cluster.id,
      memberCount: cluster.memberCount,
      entryNumber,
      secondsSincePrevEntry: !joins && previousEntryTimestamp !== undefined ? trade.timestampSec - previousEntryTimestamp : "",
      startTimestampSec: cluster.startTimestampSec,
    });
  }

  const memberCounts = new Map<string, number>();
  for (const context of contexts.values()) {
    if (context.id) memberCounts.set(context.id, Math.max(memberCounts.get(context.id) ?? 0, context.memberCount));
  }
  for (const context of contexts.values()) {
    if (context.id) context.memberCount = memberCounts.get(context.id) ?? context.memberCount;
  }

  return contexts;
}

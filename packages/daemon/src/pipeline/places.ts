import { homeFromClusters, placeFor, type BeeClient, type BeeLocation, type Home, type RhubarbDb } from "@rhubarb/core";
import { streamUuidFor } from "./sweep.js";

const HOME_REFRESH_MS = 12 * 3600_000;

/**
 * Names where each conversation happened, so a lesson can say "on the wheel at Tempozan".
 * Until Rhubarb knows where home is, it names nothing: the one place it must never name is home.
 */
export function makePlaces(deps: { db: RhubarbDb; bee: BeeClient; log: (m: string) => void }) {
  const { db, bee, log } = deps;
  let home: Home | null = null;
  let checkedAt = 0;

  const enabled = () => db.getProfile()?.usePlaces !== false;

  async function refreshHome(): Promise<void> {
    if (Date.now() - checkedAt < HOME_REFRESH_MS) return;
    checkedAt = Date.now();
    const res = await bee.locationClusters().catch((e: Error) => {
      log(`places: couldn't read Bee's places (${e.message})`);
      return null;
    });
    home = homeFromClusters(res?.clusters ?? []) ?? home;
  }

  function record(conversationUuid: string, loc: BeeLocation | null | undefined): void {
    if (!enabled() || !home || !loc?.address) return;
    db.setConversationPlace(conversationUuid, placeFor(loc, home));
    void refreshHome();
  }

  /** Once: name the places of recent conversations that happened before this existed. */
  async function backfill(): Promise<void> {
    if (db.getKv("places_backfill_v1") || !enabled()) return;
    await refreshHome();
    if (!home) return;
    const list = await bee.listConversations(50).catch(() => null);
    let named = 0;
    for (const c of list?.conversations ?? []) {
      if (!c.primary_location?.address) continue;
      const uuid = db.getKv(`conv:${c.id}`) ?? streamUuidFor(db, c);
      if (!uuid) continue;
      record(uuid, c.primary_location);
      if (db.conversationPlace(uuid)) named++;
    }
    db.setKv("places_backfill_v1", String(Date.now()));
    log(`places: named ${named} earlier conversation${named === 1 ? "" : "s"}`);
  }

  return { refreshHome, record, backfill, enabled };
}

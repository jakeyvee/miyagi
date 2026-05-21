import { KidStudy } from "./_components/KidStudy";
import { LogBridge } from "./_components/LogBridge";

/**
 * Server entry for `/kid`. Hands off to the client `<KidStudy />` component
 * which owns all kid-surface state, classifier calls, and streaming
 * responses. Kept thin so VOL-184/185/186 can layer in without touching
 * the route shell.
 *
 * `<LogBridge />` is a sibling client component (VOL-185) that forwards
 * session events from the kid bus into IndexedDB. It renders `null` and
 * intentionally does not touch `<KidStudy />` internals.
 */
export default function KidPage() {
  return (
    <>
      <KidStudy />
      <LogBridge />
    </>
  );
}

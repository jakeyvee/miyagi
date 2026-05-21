import { KidStudy } from "./_components/KidStudy";

/**
 * Server entry for `/kid`. Hands off to the client `<KidStudy />` component
 * which owns all kid-surface state, classifier calls, and streaming
 * responses. Kept thin so VOL-184/185/186 can layer in without touching
 * the route shell.
 */
export default function KidPage() {
  return <KidStudy />;
}

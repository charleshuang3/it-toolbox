import { runRegex, type RegexRequest, type RegexResult } from "./regex-tester";

self.onmessage = (e: MessageEvent<{ id: number; req: RegexRequest }>) => {
  const result: RegexResult = runRegex(e.data.req);
  self.postMessage({ id: e.data.id, result });
};


import type { Options as GotOptions } from "got";

export const defaultGotOptions: Pick<GotOptions, "retry" | "timeout"> = {
  retry: {
    limit: 3,
    methods: ["GET", "POST"],
  },
  timeout: {
    lookup: 500, // DNS
    connect: 50, // socket connected
    send: 1000, // writing data to socket
    response: 10000, // starts when request has been flushed, ends when the headers are received.
    request: 12000, // global timeout
  },
};
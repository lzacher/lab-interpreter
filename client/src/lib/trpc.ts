import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../server/routers.ts";

export const trpc = createTRPCReact<AppRouter>();

// @ts-expect-error Deno URL imports are resolved by Supabase Edge Functions.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error Deno requires the local TypeScript extension.
import { createSupportEmailHandler } from "./handler.ts";

declare const Deno: { env: { get: (key: string) => string | undefined } };
serve(createSupportEmailHandler({ env: (key: string) => Deno.env.get(key), fetch }));

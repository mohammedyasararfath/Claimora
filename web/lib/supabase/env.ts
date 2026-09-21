export function requireClientEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy web/.env.example to web/.env.local and fill in your Supabase project's URL/anon key.`,
    );
  }
  return value;
}

export function requireServerEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required server environment variable "${name}". See web/.env.example.`);
  }
  return value;
}

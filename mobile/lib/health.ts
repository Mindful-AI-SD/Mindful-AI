export type HealthResponse = {
  status: "ok";
  service: string;
  version: string;
};

export async function getHealth(): Promise<HealthResponse> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

  if (!supabaseUrl) {
    throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL");
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/health`);

  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }

  return (await response.json()) as HealthResponse;
}
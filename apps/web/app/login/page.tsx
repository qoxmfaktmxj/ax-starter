import LoginScreen from "./LoginScreen";
import { loginSeason, parseSeason } from "./login-season";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string | string[] }>;
}) {
  const date = new Date();
  const params = await searchParams;
  return (
    <LoginScreen
      initialSeason={parseSeason(params.season) ?? loginSeason(date)}
      date={date.toISOString()}
    />
  );
}

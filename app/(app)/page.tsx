import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { findNavItem } from "@/lib/nav/page-map";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let balance = 0;
  let displayName = "there";

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .maybeSingle();
    displayName = profile?.name ?? "there";

    const { data: transactions } = await supabase
      .from("token_transactions")
      .select("delta")
      .eq("user_id", user.id);
    balance = (transactions ?? []).reduce((sum, t) => sum + t.delta, 0);
  }

  const item = findNavItem("/")!;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome, {displayName}</h1>
        <p className="text-sm text-muted-foreground">
          Your day at FarmingdaleIQ.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Token balance</CardDescription>
            <CardTitle className="text-3xl">{balance}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>My positions today</CardDescription>
            <CardTitle className="text-3xl">-</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Ships with S3.</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>My to-dos</CardDescription>
            <CardTitle className="text-3xl">-</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Ships with S2.</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Full home experience</CardTitle>
            <Badge variant="outline">{item.owner}</Badge>
          </div>
          <CardDescription>{item.description}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          The token balance above is real (summed from the ledger). Positions,
          to-dos, and feed highlights wire up once their owning streams merge.
        </CardContent>
      </Card>
    </div>
  );
}

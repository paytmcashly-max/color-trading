import { GameModulePage } from "@/features/games/GameModulePage";

export default async function Page({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;

  return <GameModulePage gameId={gameId} />;
}

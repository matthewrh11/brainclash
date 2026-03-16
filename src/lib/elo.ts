const K_FACTOR = 32;

export function calculateElo(
  winnerMMR: number,
  loserMMR: number
): { winnerNew: number; loserNew: number } {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserMMR - winnerMMR) / 400));
  const expectedLoser = 1 - expectedWinner;

  return {
    winnerNew: Math.round(winnerMMR + K_FACTOR * (1 - expectedWinner)),
    loserNew: Math.round(loserMMR + K_FACTOR * (0 - expectedLoser)),
  };
}

export function calculateEloDraw(
  mmr1: number,
  mmr2: number
): { player1New: number; player2New: number } {
  const expected1 = 1 / (1 + Math.pow(10, (mmr2 - mmr1) / 400));
  const expected2 = 1 - expected1;

  return {
    player1New: Math.round(mmr1 + K_FACTOR * (0.5 - expected1)),
    player2New: Math.round(mmr2 + K_FACTOR * (0.5 - expected2)),
  };
}

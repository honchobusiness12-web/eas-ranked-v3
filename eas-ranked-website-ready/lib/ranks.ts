export const ranks = [
  { min: 0, name: "R1 Rookie Low" },
  { min: 150, name: "R1 Rookie Mid" },
  { min: 300, name: "R1 Rookie High" },
  { min: 400, name: "R2 Amateur Low" },
  { min: 500, name: "R2 Amateur Mid" },
  { min: 600, name: "R2 Amateur High" },
  { min: 700, name: "R3 Pro Low" },
  { min: 800, name: "R3 Pro Mid" },
  { min: 900, name: "R3 Pro High" },
  { min: 1000, name: "R4 Elite Low" },
  { min: 1075, name: "R4 Elite Mid" },
  { min: 1150, name: "R4 Elite High" },
  { min: 1200, name: "R5 All-Star Low" },
  { min: 1325, name: "R5 All-Star Mid" },
  { min: 1450, name: "R5 All-Star High" },
  { min: 1600, name: "R6 SuperStar Low" },
  { min: 1750, name: "R6 SuperStar Mid" },
  { min: 1900, name: "R6 SuperStar High" },
  { min: 2100, name: "R7 Remorseless Low" },
  { min: 2300, name: "R7 Remorseless Mid" },
  { min: 2500, name: "R7 Remorseless High" },
  { min: 2750, name: "R8 Legend Low" },
  { min: 3000, name: "R8 Legend Mid" },
  { min: 3250, name: "R8 Legend High" },
  { min: 3550, name: "R9 Unreal Low" },
  { min: 3850, name: "R9 Unreal Mid" },
  { min: 4150, name: "R9 Unreal High" },
  { min: 4500, name: "R10 Hall Of Fame Low" },
  { min: 4900, name: "R10 Hall Of Fame Mid" },
  { min: 5300, name: "R10 Hall Of Fame High" },
];

export function getRank(cr: number) {
  let current = ranks[0].name;
  for (const rank of ranks) if (cr >= rank.min) current = rank.name;
  return current;
}

export function getNextRank(cr: number) {
  return ranks.find((rank) => cr < rank.min) || null;
}

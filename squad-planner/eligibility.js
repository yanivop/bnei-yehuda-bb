/**
 * @param {{birthDate: string}} player  birthDate as "YYYY-MM-DD"
 * @param {{brackets: Array<{id: string, referenceBirthYear: number, exceptionQuota: number}>}} config
 *        brackets for a single gender
 * @returns {{natural: object|null, bridge: object|null, bridgeType: "auto"|"exception"|null}}
 */
export function classifyPlayer(player, config) {
  const [yearStr, monthStr] = player.birthDate.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);

  const natural = config.brackets.find((b) => b.referenceBirthYear === year) || null;
  const youngerBracket = config.brackets.find((b) => b.referenceBirthYear === year + 1) || null;

  let bridge = null;
  let bridgeType = null;
  if (youngerBracket) {
    if (month === 12) {
      bridge = youngerBracket;
      bridgeType = "auto";
    } else if (month >= 9 && month <= 11) {
      bridge = youngerBracket;
      bridgeType = "exception";
    }
  }

  return { natural, bridge, bridgeType };
}

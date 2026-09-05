/**
 * Слова, по которым видно, что найденная карточка — не страна.
 *
 * Вынесено в отдельный файл, чтобы это правило можно было прочитать и
 * проверить тестом отдельно от логики связывания: именно оно решает,
 * не откроется ли по нажатию на страну карточка утки или фильма.
 *
 * Проверяются ЦЕЛЫЕ слова: «band» не должно срабатывать на «Brandenburg».
 */
export const NOT_A_COUNTRY =
  /\b(film|movie|song|album|band|surname|family name|given name|video game|novel|book|species|genus|breed|duck|painting|ship|magazine|newspaper|footballer|singer|actor)\b/

/** Правда, если описание точно не про страну. */
export function looksNotLikeCountry(description) {
  return NOT_A_COUNTRY.test(String(description ?? '').toLowerCase())
}

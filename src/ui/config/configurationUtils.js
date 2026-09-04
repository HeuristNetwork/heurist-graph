/**
 * @file configurationUtils.js
 * @brief Shared persisted-configuration helpers.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
export const CONFIGURATION_FORMAT = "heurist-data-settings";
export const CONFIGURATION_VERSION = 1;
export const CONFIGURATION_MODES = Object.freeze([
  "preferences",
  "website",
  "publish",
  "graph",
]);

export function serializeConfigurationSettings(
  value = {},
  normalizeSettings = (item) => item,
) {
  const normalized = normalizeSettings(value);
  return {
    format: CONFIGURATION_FORMAT,
    version: CONFIGURATION_VERSION,
    options: normalized.options,
    config: normalized.config,
  };
}
export function unwrapSettings(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}
export function boolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return fallback;
}
export function stringValue(value, fallback) {
  return typeof value === "string" ? value : fallback;
}
export function nullableString(value) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}
export function enumValue(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}
export function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(max, Math.max(min, number))
    : fallback;
}
export function nullableIdentifier(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}
export function nullableList(value) {
  if (value == null || value === "") return null;
  if (!Array.isArray(value)) return null;
  return [
    ...new Set(value.map(nullableIdentifier).filter((item) => item !== null)),
  ];
}

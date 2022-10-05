const imsUrl = "https://ims.bentley.com";

/**
 * Returns the IMS authority URL. Environment prefix is adjusted based on the value of IMJS_URL_PREFIX
 * @param authorityUrl
 * @returns
 */
export function getImsAuthority(): string {
  const authorityUrl = new URL(imsUrl);

  let prefix = process.env.IMJS_URL_PREFIX;
  if (prefix) {
    prefix = prefix === "dev-" ? "qa-" : prefix;
    authorityUrl.hostname = prefix + authorityUrl.hostname;
  }
  return authorityUrl.href.replace(/\/$/, ""); // remove trailing forward slash
}
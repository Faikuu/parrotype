import Cookies from "universal-cookie";

export const excludeCookies = () => {
  const cookies = new Cookies();
  const allCookies = cookies.getAll();
  const excludedPrefixes = JSON.parse(import.meta.env.VITE_EXCLUDE_COOKIES || '');
  const excludedCookies: string[] = [];

  Object.keys(allCookies).forEach((cookieKey) => {
    if (excludedPrefixes.some((excludeKey: string) => cookieKey.startsWith(excludeKey)))
      excludedCookies.push(cookieKey);
  });

  const excludedString = excludedCookies.map(cookie => `${cookie}=`).join('; ');
  return excludedString;
}
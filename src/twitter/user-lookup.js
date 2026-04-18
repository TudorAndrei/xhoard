// Vendored from @leavingme/bird v0.8.4 (MIT). Trimmed to only getCurrentUser,
// which getLikes() needs to resolve the authenticated user id.
import { SETTINGS_NAME_REGEX, SETTINGS_SCREEN_NAME_REGEX, SETTINGS_USER_ID_REGEX } from './constants.js';
export function withUserLookup(Base) {
    class TwitterClientUserLookup extends Base {
        constructor(...args) {
            super(...args);
        }
        async getCurrentUser() {
            const candidateUrls = [
                'https://x.com/i/api/account/settings.json',
                'https://api.twitter.com/1.1/account/settings.json',
                'https://x.com/i/api/account/verify_credentials.json?skip_status=true&include_entities=false',
                'https://api.twitter.com/1.1/account/verify_credentials.json?skip_status=true&include_entities=false',
            ];
            let lastError;
            for (const url of candidateUrls) {
                try {
                    const response = await this.fetchWithTimeout(url, {
                        method: 'GET',
                        headers: this.getHeaders(),
                    });
                    if (!response.ok) {
                        const text = await response.text();
                        lastError = `HTTP ${response.status}: ${text.slice(0, 200)}`;
                        continue;
                    }
                    let data;
                    try {
                        data = await response.json();
                    }
                    catch (error) {
                        lastError = error instanceof Error ? error.message : String(error);
                        continue;
                    }
                    const username = typeof data?.screen_name === 'string'
                        ? data.screen_name
                        : typeof data?.user?.screen_name === 'string'
                            ? data.user.screen_name
                            : null;
                    const name = typeof data?.name === 'string'
                        ? data.name
                        : typeof data?.user?.name === 'string'
                            ? data.user.name
                            : (username ?? '');
                    const userId = typeof data?.user_id === 'string'
                        ? data.user_id
                        : typeof data?.user_id_str === 'string'
                            ? data.user_id_str
                            : typeof data?.user?.id_str === 'string'
                                ? data.user.id_str
                                : typeof data?.user?.id === 'string'
                                    ? data.user.id
                                    : null;
                    if (username && userId) {
                        this.clientUserId = userId;
                        return {
                            success: true,
                            user: {
                                id: userId,
                                username,
                                name: name || username,
                            },
                        };
                    }
                    lastError = 'Could not determine current user from response';
                }
                catch (error) {
                    lastError = error instanceof Error ? error.message : String(error);
                }
            }
            const profilePages = ['https://x.com/settings/account', 'https://twitter.com/settings/account'];
            for (const page of profilePages) {
                try {
                    const response = await this.fetchWithTimeout(page, {
                        headers: {
                            cookie: this.cookieHeader,
                            'user-agent': this.userAgent,
                        },
                    });
                    if (!response.ok) {
                        lastError = `HTTP ${response.status} (settings page)`;
                        continue;
                    }
                    const html = await response.text();
                    const usernameMatch = SETTINGS_SCREEN_NAME_REGEX.exec(html);
                    const idMatch = SETTINGS_USER_ID_REGEX.exec(html);
                    const nameMatch = SETTINGS_NAME_REGEX.exec(html);
                    const username = usernameMatch?.[1];
                    const userId = idMatch?.[1];
                    const name = nameMatch?.[1]?.replace(/\\"/g, '"');
                    if (username && userId) {
                        return {
                            success: true,
                            user: {
                                id: userId,
                                username,
                                name: name || username,
                            },
                        };
                    }
                    lastError = 'Could not parse settings page for user info';
                }
                catch (error) {
                    lastError = error instanceof Error ? error.message : String(error);
                }
            }
            return {
                success: false,
                error: lastError ?? 'Unknown error fetching current user',
            };
        }
    }
    return TwitterClientUserLookup;
}

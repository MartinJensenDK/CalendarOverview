<?php

namespace App\Graph;

use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * OAuth 2.0 authorization-code flow (with PKCE) and silent token refresh
 * for the Microsoft identity platform.
 */
class GraphTokenProvider
{
    public function isConfigured(): bool
    {
        return config('calendar.tenant_id') !== '' && config('calendar.client_id') !== '' && config('calendar.client_secret') !== '';
    }

    public function tenant(): string
    {
        return config('calendar.tenant_id') ?: 'organizations';
    }

    public function authorizeEndpoint(): string
    {
        return config('calendar.authority').'/'.$this->tenant().'/oauth2/v2.0/authorize';
    }

    public function tokenEndpoint(): string
    {
        return config('calendar.authority').'/'.$this->tenant().'/oauth2/v2.0/token';
    }

    public function adminConsentUrl(string $redirect): string
    {
        return config('calendar.authority').'/'.$this->tenant().'/adminconsent?'.http_build_query([
            'client_id' => config('calendar.client_id'),
            'redirect_uri' => $redirect,
        ]);
    }

    public function scopeString(): string
    {
        return implode(' ', config('calendar.scopes'));
    }

    public function authorizeUrl(string $state, string $codeChallenge, string $redirect, ?string $loginHint = null): string
    {
        $params = [
            'client_id' => config('calendar.client_id'),
            'response_type' => 'code',
            'redirect_uri' => $redirect,
            'response_mode' => 'query',
            'scope' => $this->scopeString(),
            'state' => $state,
            'code_challenge' => $codeChallenge,
            'code_challenge_method' => 'S256',
            'prompt' => 'select_account',
        ];
        if ($loginHint) {
            $params['login_hint'] = $loginHint;
        }

        return $this->authorizeEndpoint().'?'.http_build_query($params);
    }

    /** @return array{access_token:string, refresh_token:?string, expires_in:int, scope:string, id_token:?string} */
    public function exchangeCode(string $code, string $codeVerifier, string $redirect): array
    {
        $response = Http::asForm()->timeout(30)->post($this->tokenEndpoint(), [
            'client_id' => config('calendar.client_id'),
            'client_secret' => config('calendar.client_secret'),
            'grant_type' => 'authorization_code',
            'code' => $code,
            'redirect_uri' => $redirect,
            'code_verifier' => $codeVerifier,
            'scope' => $this->scopeString(),
        ]);

        if ($response->failed()) {
            $error = $response->json('error_description') ?? $response->json('error') ?? $response->body();
            throw new ReauthRequiredException('Sign-in failed: '.mb_substr((string) $error, 0, 300), $response->json('error'));
        }

        return $response->json();
    }

    /** Access token for the user, refreshed when it expires within 5 minutes. */
    public function accessToken(User $user): string
    {
        if (! $user->access_token || ! $user->refresh_token) {
            throw new ReauthRequiredException('No Microsoft session stored for this user.', 'no_token');
        }

        if (! $user->token_expires_at || $user->token_expires_at->lte(Carbon::now()->addMinutes(5))) {
            $this->refresh($user);
        }

        return $user->access_token;
    }

    public function client(User $user): GraphClient
    {
        return new GraphClient($this->accessToken($user));
    }

    public function refresh(User $user): void
    {
        $response = Http::asForm()->timeout(30)->post($this->tokenEndpoint(), [
            'client_id' => config('calendar.client_id'),
            'client_secret' => config('calendar.client_secret'),
            'grant_type' => 'refresh_token',
            'refresh_token' => $user->refresh_token,
            'scope' => $this->scopeString(),
        ]);

        if ($response->failed()) {
            Log::info('Token refresh failed', ['user' => $user->id, 'error' => $response->json('error')]);
            $user->forceFill(['access_token' => null, 'refresh_token' => null, 'token_expires_at' => null])->save();
            throw new ReauthRequiredException('Your Microsoft session has expired. Please sign in again.', $response->json('error'));
        }

        $this->storeTokens($user, $response->json());
    }

    public function storeTokens(User $user, array $tokens): void
    {
        $user->forceFill([
            'access_token' => $tokens['access_token'],
            'refresh_token' => $tokens['refresh_token'] ?? $user->refresh_token,
            'token_expires_at' => Carbon::now()->addSeconds((int) ($tokens['expires_in'] ?? 3600)),
            'granted_scopes' => $tokens['scope'] ?? $user->granted_scopes,
        ])->save();
    }

    /** Unverified decode of the id_token payload (the token came straight from the token endpoint over TLS). */
    public static function decodeIdToken(?string $idToken): array
    {
        if (! $idToken || substr_count($idToken, '.') !== 2) {
            return [];
        }
        $payload = explode('.', $idToken)[1];
        $json = base64_decode(strtr($payload, '-_', '+/').str_repeat('=', (4 - strlen($payload) % 4) % 4), true);

        return $json ? (json_decode($json, true) ?: []) : [];
    }
}

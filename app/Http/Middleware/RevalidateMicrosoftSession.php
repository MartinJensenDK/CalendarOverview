<?php

namespace App\Http\Middleware;

use App\Graph\GraphTokenProvider;
use App\Graph\ReauthRequiredException;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * A signed-in browser session is only as valid as the Microsoft session behind it.
 * When the stored tokens are gone (refresh failed, account disabled or signed out elsewhere) the
 * local session ends too, and a long-idle token is refreshed so a disabled account is caught
 * even when every answer could have come from the cache.
 */
class RevalidateMicrosoftSession
{
    public function __construct(private readonly GraphTokenProvider $tokens) {}

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user) {
            return $next($request);
        }

        if (! $user->refresh_token) {
            return $this->signOut($request, 'Your Microsoft session has ended. Please sign in again.');
        }

        $stale = Carbon::now()->subMinutes((int) config('calendar.revalidate_minutes'));
        if (! $user->token_expires_at || $user->token_expires_at->lt($stale)) {
            try {
                $this->tokens->refresh($user);
            } catch (ReauthRequiredException $e) {
                return $this->signOut($request, $e->getMessage());
            }
        }

        return $next($request);
    }

    private function signOut(Request $request, string $message): Response
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        if ($request->is('api/*') || $request->expectsJson()) {
            return response()->json(['error' => 'reauth', 'message' => __($message), 'login_url' => url('/auth/login')], 401);
        }

        return redirect()->route('login')->with('auth_error', __($message));
    }
}

<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Symfony\Component\HttpFoundation\Response;

/** Records activity so the scheduler knows whose token to use for background syncs. */
class TouchLastSeen
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user && (! $user->last_seen_at || $user->last_seen_at->lt(Carbon::now()->subMinutes(10)))) {
            $user->forceFill(['last_seen_at' => Carbon::now()])->saveQuietly();
        }

        return $next($request);
    }
}

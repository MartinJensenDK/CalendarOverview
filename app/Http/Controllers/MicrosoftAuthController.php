<?php

namespace App\Http\Controllers;

use App\Graph\GraphClient;
use App\Graph\GraphException;
use App\Graph\GraphTokenProvider;
use App\Graph\ReauthRequiredException;
use App\Models\ColorRule;
use App\Models\DirectoryUser;
use App\Models\User;
use App\Services\DirectorySyncService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\View\View;

class MicrosoftAuthController extends Controller
{
    public function __construct(private readonly GraphTokenProvider $tokens) {}

    public function showLogin(Request $request): View|RedirectResponse
    {
        if (Auth::check()) {
            return redirect('/');
        }

        return view('auth.login', [
            'configured' => $this->tokens->isConfigured(),
            'error' => $request->session()->get('auth_error'),
            'adminConsentUrl' => $this->tokens->isConfigured() ? $this->tokens->adminConsentUrl(url('/auth/consented')) : null,
        ]);
    }

    public function redirect(Request $request): RedirectResponse
    {
        if (! $this->tokens->isConfigured()) {
            return redirect()->route('login')->with('auth_error', __('Microsoft sign-in is not configured yet.'));
        }

        $state = Str::random(40);
        $verifier = Str::random(96);
        $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

        $request->session()->put('oauth', ['state' => $state, 'verifier' => $verifier]);

        return redirect()->away($this->tokens->authorizeUrl($state, $challenge, $this->redirectUri(), $request->query('login_hint')));
    }

    public function callback(Request $request, DirectorySyncService $directory): RedirectResponse
    {
        $stored = $request->session()->pull('oauth');

        if ($request->filled('error')) {
            return $this->fail($request->query('error_description') ?: $request->query('error'));
        }
        if (! $stored || ! hash_equals($stored['state'], (string) $request->query('state', ''))) {
            return $this->fail(__('The sign-in request expired. Please try again.'));
        }
        if (! $request->filled('code')) {
            return $this->fail(__('No authorization code was returned.'));
        }

        try {
            $tokens = $this->tokens->exchangeCode($request->query('code'), $stored['verifier'], $this->redirectUri());
        } catch (ReauthRequiredException $e) {
            return $this->fail($e->getMessage());
        }

        $claims = GraphTokenProvider::decodeIdToken($tokens['id_token'] ?? null);
        $tenant = config('calendar.tenant_id');
        if ($tenant && ! in_array($tenant, ['common', 'organizations'], true) && isset($claims['tid']) && $claims['tid'] !== $tenant) {
            return $this->fail(__('This account belongs to another organisation.'));
        }

        $graph = new GraphClient($tokens['access_token']);
        try {
            $me = $graph->get('/me', ['$select' => 'id,displayName,givenName,surname,mail,userPrincipalName,jobTitle,department,officeLocation']);
        } catch (GraphException $e) {
            return $this->fail(__('Could not read your profile from Microsoft Graph.').' ('.$e->getMessage().')');
        }

        $email = $me['mail'] ?? $me['userPrincipalName'] ?? '';
        $allowed = config('calendar.allowed_domains');
        if ($allowed !== [] && ! in_array(strtolower(Str::after($email, '@')), array_map('strtolower', $allowed), true)) {
            return $this->fail(__('Your account is not allowed to use this site.'));
        }

        $user = User::firstOrNew(['entra_id' => $me['id']]);
        $isNew = ! $user->exists;
        $user->forceFill([
            'name' => $me['displayName'] ?? $email,
            'email' => $email,
            'given_name' => $me['givenName'] ?? null,
            'job_title' => $me['jobTitle'] ?? null,
            'last_login_at' => Carbon::now(),
            'last_seen_at' => Carbon::now(),
        ])->save();
        $this->tokens->storeTokens($user, $tokens);

        // Keep a directory row for the signed-in user so "me" is always present in the overview.
        DirectoryUser::updateOrCreate(['id' => $me['id']], [
            'display_name' => $me['displayName'] ?? $email,
            'given_name' => $me['givenName'] ?? null,
            'surname' => $me['surname'] ?? null,
            'mail' => $me['mail'] ?? null,
            'upn' => $me['userPrincipalName'] ?? null,
            'job_title' => $me['jobTitle'] ?? null,
            'department' => $me['department'] ?? null,
            'office_location' => $me['officeLocation'] ?? null,
            'account_enabled' => true,
            'is_demo' => false,
        ]);

        try {
            $directory->syncManagerOf($user, $graph);
        } catch (GraphException $e) {
            Log::info('Manager lookup failed at sign-in', ['user' => $user->id, 'status' => $e->status, 'code' => $e->graphCode]);
        }

        if ($isNew || $user->colorRules()->count() === 0) {
            foreach (ColorRule::defaults() as $i => $rule) {
                $user->colorRules()->create($rule + ['sort_order' => $i, 'enabled' => true]);
            }
        }

        Auth::login($user, remember: true);
        $request->session()->regenerate();

        return redirect()->intended('/');
    }

    /** Landing page after the admin-consent flow. */
    public function consented(Request $request): RedirectResponse
    {
        if ($request->query('admin_consent') === 'True') {
            return redirect()->route('login')->with('auth_error', null)->with('auth_info', __('Admin consent granted. You can sign in now.'));
        }

        return $this->fail($request->query('error_description') ?: __('Admin consent was not granted.'));
    }

    public function logout(Request $request): RedirectResponse
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->route('login');
    }

    private function redirectUri(): string
    {
        return url('/auth/callback');
    }

    private function fail(string $message): RedirectResponse
    {
        return redirect()->route('login')->with('auth_error', $message);
    }
}

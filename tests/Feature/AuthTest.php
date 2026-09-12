<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\Support\Fixtures;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['calendar.tenant_id' => 'tenant-1', 'calendar.client_id' => 'client-1', 'calendar.client_secret' => 'secret']);
    }

    public function test_login_page_and_redirect_to_microsoft(): void
    {
        $this->get('/login')->assertOk()->assertSee('Sign in with Microsoft 365');
        $response = $this->get('/auth/login');
        $response->assertRedirect();
        $location = $response->headers->get('Location');
        $this->assertStringStartsWith('https://login.microsoftonline.com/tenant-1/oauth2/v2.0/authorize?', $location);
        $this->assertStringContainsString('code_challenge_method=S256', $location);
        $this->assertStringContainsString('Calendars.Read', urldecode($location));
    }

    public function test_api_requires_authentication(): void
    {
        $this->getJson('/api/me')->assertStatus(401);
        $this->get('/')->assertRedirect('/login');
    }

    public function test_security_headers_and_hsts_over_https(): void
    {
        $secure = $this->get('https://localhost/login')->assertOk();
        $this->assertSame('max-age=31536000; includeSubDomains', $secure->headers->get('Strict-Transport-Security'));
        $this->assertSame('nosniff', $secure->headers->get('X-Content-Type-Options'));
        $this->assertSame('SAMEORIGIN', $secure->headers->get('X-Frame-Options'));
        $this->assertNotNull($secure->headers->get('Permissions-Policy'));

        $plain = $this->get('http://localhost/login')->assertOk();
        $this->assertNull($plain->headers->get('Strict-Transport-Security'));
    }

    public function test_sign_in_routes_are_rate_limited(): void
    {
        for ($i = 0; $i < 20; $i++) {
            $this->get('/auth/login')->assertRedirect();
        }
        $this->get('/auth/login')->assertStatus(429);
    }

    public function test_logout_drops_the_microsoft_tokens(): void
    {
        $user = Fixtures::user();
        $this->actingAs($user)->post('/auth/logout')->assertRedirect('/login');
        $user->refresh();
        $this->assertNull($user->access_token);
        $this->assertNull($user->refresh_token);
        $this->assertNull($user->token_expires_at);
        $this->getJson('/api/me')->assertStatus(401);
    }

    public function test_session_ends_when_the_microsoft_session_is_gone(): void
    {
        $user = Fixtures::user(['refresh_token' => null]);
        $this->actingAs($user)->getJson('/api/me')->assertStatus(401)->assertJsonPath('error', 'reauth');
        $this->assertGuest();
    }

    public function test_long_expired_token_is_refreshed_and_a_disabled_account_is_signed_out(): void
    {
        Http::fake(['login.microsoftonline.com/*' => Http::response(['error' => 'invalid_grant', 'error_description' => 'AADSTS50057: The user account is disabled.'], 400)]);
        $user = Fixtures::user(['token_expires_at' => now()->subHours(3)]);
        $this->actingAs($user)->getJson('/api/me')->assertStatus(401)->assertJsonPath('error', 'reauth');
        Http::assertSentCount(1);
        $this->assertNull($user->fresh()->refresh_token);
        $this->assertGuest();
    }

    public function test_long_expired_token_is_refreshed_silently_for_an_active_account(): void
    {
        Http::fake(['login.microsoftonline.com/*' => Http::response(['access_token' => 'at2', 'refresh_token' => 'rt2', 'expires_in' => 3600])]);
        $ok = Fixtures::user(['token_expires_at' => now()->subHours(3)]);
        $this->actingAs($ok)->getJson('/api/me')->assertOk();
        Http::assertSent(fn ($request) => str_contains($request->url(), 'login.microsoftonline.com'));
        $this->assertSame('rt2', $ok->fresh()->refresh_token);
        $this->assertTrue($ok->fresh()->token_expires_at->gt(now()));
    }

    public function test_callback_creates_user_with_default_rules(): void
    {
        Http::fake([
            'login.microsoftonline.com/*' => Http::response(['access_token' => 'at', 'refresh_token' => 'rt', 'expires_in' => 3600, 'scope' => 'User.Read Calendars.Read', 'id_token' => self::idToken(['tid' => 'tenant-1'])]),
            'graph.microsoft.com/v1.0/me?*' => Http::response(['id' => 'entra-42', 'displayName' => 'Anna Andersen', 'mail' => 'anna@example.com', 'userPrincipalName' => 'anna@example.com', 'jobTitle' => 'Designer']),
            'graph.microsoft.com/v1.0/me/manager*' => Http::response(['id' => 'mgr-9', 'displayName' => 'Boss']),
        ]);

        $this->withSession(['oauth' => ['state' => 'state-1', 'verifier' => 'v']])
            ->get('/auth/callback?code=abc&state=state-1')
            ->assertRedirect('/');

        $user = User::where('entra_id', 'entra-42')->first();
        $this->assertNotNull($user);
        $this->assertSame('mgr-9', $user->manager_entra_id);
        $this->assertSame('at', $user->access_token);
        $this->assertCount(4, $user->colorRules);
        $this->assertDatabaseHas('directory_users', ['id' => 'entra-42', 'manager_id' => 'mgr-9']);
        $this->assertAuthenticatedAs($user);
    }

    public function test_callback_rejects_bad_state_and_foreign_tenant(): void
    {
        $this->withSession(['oauth' => ['state' => 'state-1', 'verifier' => 'v']])
            ->get('/auth/callback?code=abc&state=wrong')
            ->assertRedirect('/login')->assertSessionHas('auth_error');

        Http::fake(['login.microsoftonline.com/*' => Http::response(['access_token' => 'at', 'refresh_token' => 'rt', 'expires_in' => 3600, 'id_token' => self::idToken(['tid' => 'other'])])]);
        $this->withSession(['oauth' => ['state' => 's', 'verifier' => 'v']])
            ->get('/auth/callback?code=abc&state=s')
            ->assertRedirect('/login')->assertSessionHas('auth_error');
        $this->assertSame(0, User::count());
    }

    private static function idToken(array $claims): string
    {
        $b64 = fn ($d) => rtrim(strtr(base64_encode(json_encode($d)), '+/', '-_'), '=');

        return $b64(['alg' => 'none']).'.'.$b64($claims).'.sig';
    }
}

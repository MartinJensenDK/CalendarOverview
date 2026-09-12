<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
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

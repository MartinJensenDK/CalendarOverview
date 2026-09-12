<?php

namespace Tests\Feature;

use App\Support\EnvWriter;
use App\Support\Installer;
use Tests\TestCase;

class InstallTest extends TestCase
{
    protected function markInstalled(): bool
    {
        return false;
    }

    public function test_requests_redirect_to_setup_until_installed(): void
    {
        $this->get('/')->assertRedirect('/setup');
        $this->get('/login')->assertRedirect('/setup');
        $this->getJson('/api/me')->assertStatus(503)->assertJsonPath('error', 'not_installed');
        $this->get('/setup')->assertOk()->assertSee('Unlock the setup')->assertDontSee('Set up your calendar overview');
    }

    public function test_wizard_is_unlocked_with_the_token_from_the_server(): void
    {
        $this->get('/setup')->assertOk();
        $this->assertFileExists(Installer::setupTokenFile());
        $this->postJson('/setup/test-database', ['db_connection' => 'sqlite'])->assertStatus(403);
        $this->post('/setup', ['app_name' => 'x'])->assertStatus(403);

        $this->from('/setup')->post('/setup/unlock', ['token' => 'wrong'])->assertRedirect('/setup')->assertSessionHasErrors('token');
        $this->get('/setup')->assertOk()->assertSee('Unlock the setup');

        $this->post('/setup/unlock', ['token' => Installer::setupToken()])->assertRedirect('/setup');
        $this->get('/setup')->assertOk()->assertSee('Set up your calendar overview');

        // The token also works as a query parameter (printed by `calendar:install --token`).
        $this->flushSession();
        $this->get('/setup?token='.Installer::setupToken())->assertRedirect('/setup');
        $this->get('/setup')->assertOk()->assertSee('Set up your calendar overview');
    }

    public function test_setup_form_does_not_flash_secrets_back(): void
    {
        $this->withSession(['setup_unlocked' => true])
            ->from('/setup')
            ->post('/setup', ['app_name' => 'Cal', 'app_url' => 'https://cal.test', 'app_locale' => 'en', 'db_connection' => 'mysql', 'db_host' => '127.0.0.1', 'db_port' => 1, 'db_database' => 'x', 'db_username' => 'x', 'db_password' => 'hunter2', 'ms_client_secret' => 'top-secret'])
            ->assertRedirect('/setup')
            ->assertSessionHasErrors('install')
            ->assertSessionHasInput('db_host', '127.0.0.1')
            ->assertSessionMissing('_old_input.db_password')
            ->assertSessionMissing('_old_input.ms_client_secret');
    }

    public function test_database_test_endpoint_validates_and_reports(): void
    {
        $this->withSession(['setup_unlocked' => true]);
        $this->postJson('/setup/test-database', ['db_connection' => 'mysql'])->assertStatus(422);
        $this->postJson('/setup/test-database', ['db_connection' => 'mysql', 'db_host' => '127.0.0.1', 'db_port' => 1, 'db_database' => 'x', 'db_username' => 'x', 'db_password' => 'x'])
            ->assertOk()->assertJsonPath('ok', false);
    }

    public function test_env_writer_replaces_and_appends_keys(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'env');
        file_put_contents($path, "APP_NAME=Laravel\n# DB_HOST=127.0.0.1\nOTHER=1\n");
        $writer = new EnvWriter($path);
        $writer->write(['APP_NAME' => 'Calendar overview', 'DB_HOST' => 'db.local', 'MS_CLIENT_SECRET' => 'a b"c', 'NEW_KEY' => true]);
        $writer->write(['APP_NAME' => 'Pa$1ss\\word$0']);
        $content = file_get_contents($path);
        unlink($path);

        $this->assertStringContainsString('APP_NAME="Pa$1ss\\\\word$0"', $content);
        $this->assertStringNotContainsString('Calendar overview', $content);
        $this->assertStringContainsString("\nDB_HOST=db.local\n", $content);
        $this->assertStringContainsString('MS_CLIENT_SECRET="a b\"c"', $content);
        $this->assertStringContainsString('NEW_KEY=true', $content);
        $this->assertStringContainsString('OTHER=1', $content);
        $this->assertStringNotContainsString('# DB_HOST', $content);
    }
}

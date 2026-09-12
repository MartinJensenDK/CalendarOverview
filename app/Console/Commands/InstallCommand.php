<?php

namespace App\Console\Commands;

use App\Services\InstallService;
use App\Support\Installer;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;

class InstallCommand extends Command
{
    protected $signature = 'calendar:install
        {--name= : Site name}
        {--url= : Public URL, e.g. https://calendar.example.com}
        {--locale=en : Default language (en|da)}
        {--db=sqlite : Database driver (sqlite|mysql|mariadb|pgsql)}
        {--db-host=127.0.0.1} {--db-port=} {--db-name=} {--db-user=} {--db-pass=}
        {--tenant= : Microsoft Entra tenant id} {--client-id=} {--client-secret=}
        {--allowed-domains= : Comma separated e-mail domains allowed to sign in}
        {--force : Run even when already installed}';

    protected $description = 'Interactive first-run setup: site name, database and Microsoft 365 settings';

    public function handle(InstallService $installer): int
    {
        if (Installer::isInstalled() && ! $this->option('force')) {
            $this->components->warn('Already installed. Use --force to run the setup again.');

            return self::SUCCESS;
        }

        $current = $installer->currentValues();
        $interactive = $this->input->isInteractive();
        $ask = fn (string $question, ?string $default, string $option) => $this->option($option) ?? ($interactive ? $this->ask($question, $default) : $default);

        $this->components->info('Team Calendar Overview – setup');
        $data = [
            'app_name' => $ask('Site name', $current['app_name'], 'name'),
            'app_url' => $ask('Public URL', $current['app_url'], 'url'),
            'app_locale' => $this->option('locale') ?: ($interactive ? $this->choice('Default language', ['en', 'da'], 0) : 'en'),
        ];

        $driver = $this->option('db') ?: 'sqlite';
        if ($interactive && ! $this->option('db')) {
            $driver = $this->choice('Database', ['sqlite', 'mysql', 'mariadb', 'pgsql'], 0);
        }
        $data['db_connection'] = $driver;
        if ($driver !== 'sqlite') {
            $data['db_host'] = $this->option('db-host') ?: ($interactive ? $this->ask('Database host', '127.0.0.1') : '127.0.0.1');
            $data['db_port'] = $this->option('db-port') ?: ($interactive ? $this->ask('Database port', $driver === 'pgsql' ? '5432' : '3306') : null);
            $data['db_database'] = $this->option('db-name') ?: ($interactive ? $this->ask('Database name') : null);
            $data['db_username'] = $this->option('db-user') ?: ($interactive ? $this->ask('Database user') : null);
            $data['db_password'] = $this->option('db-pass') ?? ($interactive ? $this->secret('Database password') : '');
        }

        $data['ms_tenant_id'] = $this->option('tenant') ?? ($interactive ? $this->ask('Microsoft Entra tenant id (leave empty to configure later)', $current['ms_tenant_id'] ?: null) : null);
        $data['ms_client_id'] = $this->option('client-id') ?? ($interactive ? $this->ask('Application (client) id', $current['ms_client_id'] ?: null) : null);
        $data['ms_client_secret'] = $this->option('client-secret') ?? ($interactive ? $this->secret('Client secret') : null);
        $data['ms_allowed_domains'] = $this->option('allowed-domains') ?? ($interactive ? $this->ask('Allowed e-mail domains (comma separated, empty = all)', $current['ms_allowed_domains'] ?: null) : null);

        $validator = Validator::make($data, InstallService::rules());
        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->components->error($error);
            }

            return self::FAILURE;
        }

        $this->components->task('Testing database connection', fn () => $installer->testDatabase($data)['ok']);
        try {
            $installer->install($data);
        } catch (\Throwable $e) {
            $this->components->error($e->getMessage());

            return self::FAILURE;
        }

        $this->components->info('Setup complete. Redirect URI for the app registration: '.rtrim($data['app_url'], '/').'/auth/callback');

        return self::SUCCESS;
    }
}

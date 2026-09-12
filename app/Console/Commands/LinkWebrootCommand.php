<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

/**
 * For hosts where the web root cannot be pointed at public/: puts an index.php shim
 * and symlinks for the static assets into an existing document root.
 */
class LinkWebrootCommand extends Command
{
    protected $signature = 'calendar:link-webroot {path : Existing document root directory} {--copy : Copy assets instead of symlinking}';

    protected $description = 'Expose public/ inside another document root (index.php shim + asset links)';

    public function handle(): int
    {
        $root = rtrim($this->argument('path'), '/');
        if (! is_dir($root) || ! is_writable($root)) {
            $this->components->error("Directory {$root} does not exist or is not writable.");

            return self::FAILURE;
        }

        $public = public_path();
        $shim = "<?php\n\n// Team Calendar Overview – forwards requests to the application's public/index.php\nrequire '".str_replace("'", "\\'", $public)."/index.php';\n";
        file_put_contents($root.'/index.php', $shim);
        $this->components->twoColumnDetail('index.php', 'written');

        foreach (['assets', 'favicon.ico', 'favicon.svg', 'robots.txt', '.htaccess'] as $entry) {
            $source = $public.'/'.$entry;
            if (! file_exists($source)) {
                continue;
            }
            $target = $root.'/'.$entry;
            if (is_link($target) || file_exists($target)) {
                is_dir($target) && ! is_link($target) ? $this->deleteDirectory($target) : unlink($target);
            }
            if ($this->option('copy')) {
                is_dir($source) ? $this->copyDirectory($source, $target) : copy($source, $target);
                $this->components->twoColumnDetail($entry, 'copied');
            } else {
                symlink($source, $target);
                $this->components->twoColumnDetail($entry, 'linked');
            }
        }

        $this->components->info('Done. Point your browser at the site to run the setup wizard.');

        return self::SUCCESS;
    }

    private function copyDirectory(string $from, string $to): void
    {
        mkdir($to, 0775, true);
        foreach (scandir($from) as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            is_dir("$from/$item") ? $this->copyDirectory("$from/$item", "$to/$item") : copy("$from/$item", "$to/$item");
        }
    }

    private function deleteDirectory(string $dir): void
    {
        foreach (scandir($dir) as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            is_dir("$dir/$item") && ! is_link("$dir/$item") ? $this->deleteDirectory("$dir/$item") : unlink("$dir/$item");
        }
        rmdir($dir);
    }
}

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('directory_users', function (Blueprint $table) {
            $table->string('id', 64)->primary();
            $table->string('display_name');
            $table->string('given_name')->nullable();
            $table->string('surname')->nullable();
            $table->string('mail')->nullable()->index();
            $table->string('upn')->nullable();
            $table->string('job_title')->nullable();
            $table->string('department')->nullable();
            $table->string('office_location')->nullable();
            $table->string('manager_id', 64)->nullable()->index();
            $table->boolean('account_enabled')->default(true)->index();
            $table->string('photo_etag')->nullable();
            $table->boolean('has_photo')->default(false);
            $table->timestamp('photo_synced_at')->nullable();
            $table->timestamp('synced_at')->nullable();
            $table->boolean('is_demo')->default(false)->index();
            $table->timestamps();
        });

        Schema::create('groups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('type', 16)->default('manual'); // manual | entra
            $table->string('entra_group_id', 64)->nullable();
            $table->string('entra_group_name')->nullable();
            $table->boolean('visible')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamp('members_synced_at')->nullable();
            $table->timestamps();
        });

        Schema::create('group_members', function (Blueprint $table) {
            $table->foreignId('group_id')->constrained()->cascadeOnDelete();
            $table->string('directory_user_id', 64);
            $table->primary(['group_id', 'directory_user_id']);
        });

        Schema::create('group_managers', function (Blueprint $table) {
            $table->foreignId('group_id')->constrained()->cascadeOnDelete();
            $table->string('manager_directory_user_id', 64);
            $table->primary(['group_id', 'manager_directory_user_id']);
        });

        Schema::create('color_rules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('field', 16);      // subject | location | status | all_day
            $table->string('operator', 16);   // contains | not_contains | equals | starts_with | regex | is
            $table->string('value')->nullable();
            $table->string('color', 9);
            $table->string('text_color', 9)->nullable();
            $table->boolean('enabled')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('schedule_items', function (Blueprint $table) {
            $table->id();
            $table->string('directory_user_id', 64);
            $table->dateTime('start_utc');
            $table->dateTime('end_utc');
            $table->string('status', 24);
            $table->string('subject')->nullable();
            $table->string('location')->nullable();
            $table->boolean('is_private')->default(false);
            $table->boolean('is_all_day')->default(false);
            $table->index(['directory_user_id', 'start_utc']);
            $table->index(['directory_user_id', 'end_utc']);
        });

        Schema::create('schedule_freshness', function (Blueprint $table) {
            $table->string('directory_user_id', 64);
            $table->date('day');
            $table->timestamp('fetched_at');
            $table->primary(['directory_user_id', 'day']);
        });

        Schema::create('sync_states', function (Blueprint $table) {
            $table->string('key', 64)->primary();
            $table->text('value')->nullable();
            $table->timestamp('updated_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sync_states');
        Schema::dropIfExists('schedule_freshness');
        Schema::dropIfExists('schedule_items');
        Schema::dropIfExists('color_rules');
        Schema::dropIfExists('group_managers');
        Schema::dropIfExists('group_members');
        Schema::dropIfExists('groups');
        Schema::dropIfExists('directory_users');
    }
};

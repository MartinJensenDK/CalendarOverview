<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Cached calendar data is scoped to the signed-in user who fetched it (viewer_id), because
     * Microsoft Graph returns different levels of detail to different people. The tables only hold
     * cache, so they are recreated rather than migrated.
     */
    public function up(): void
    {
        Schema::dropIfExists('schedule_items');
        Schema::dropIfExists('work_hours');
        Schema::dropIfExists('schedule_freshness');

        Schema::create('schedule_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('viewer_id');
            $table->string('directory_user_id', 64);
            $table->dateTime('start_utc');
            $table->dateTime('end_utc');
            $table->string('status', 24);
            $table->string('subject')->nullable();
            $table->string('location')->nullable();
            $table->boolean('is_private')->default(false);
            $table->boolean('is_all_day')->default(false);
            $table->index(['viewer_id', 'directory_user_id', 'start_utc']);
            $table->index(['viewer_id', 'directory_user_id', 'end_utc']);
            $table->index('end_utc');
        });

        Schema::create('work_hours', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('viewer_id');
            $table->string('directory_user_id', 64);
            $table->dateTime('start_utc');
            $table->dateTime('end_utc');
            $table->string('location', 32)->nullable();
            $table->index(['viewer_id', 'directory_user_id', 'start_utc']);
            $table->index(['viewer_id', 'directory_user_id', 'end_utc']);
            $table->index('end_utc');
        });

        Schema::create('schedule_freshness', function (Blueprint $table) {
            $table->unsignedBigInteger('viewer_id');
            $table->string('directory_user_id', 64);
            $table->date('day');
            $table->timestamp('fetched_at');
            $table->primary(['viewer_id', 'directory_user_id', 'day']);
            $table->index('day');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('schedule_items');
        Schema::dropIfExists('work_hours');
        Schema::dropIfExists('schedule_freshness');

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
        Schema::create('work_hours', function (Blueprint $table) {
            $table->id();
            $table->string('directory_user_id', 64);
            $table->dateTime('start_utc');
            $table->dateTime('end_utc');
            $table->string('location', 32)->nullable();
            $table->index(['directory_user_id', 'start_utc']);
            $table->index(['directory_user_id', 'end_utc']);
        });
        Schema::create('schedule_freshness', function (Blueprint $table) {
            $table->string('directory_user_id', 64);
            $table->date('day');
            $table->timestamp('fetched_at');
            $table->primary(['directory_user_id', 'day']);
        });
    }
};

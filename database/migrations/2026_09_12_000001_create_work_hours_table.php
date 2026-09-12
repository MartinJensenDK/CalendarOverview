<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Working hours per person and day, as reported by Microsoft Graph
        // (getSchedule workingHours for colleagues, work hours & locations for yourself).
        Schema::create('work_hours', function (Blueprint $table) {
            $table->id();
            $table->string('directory_user_id', 64);
            $table->dateTime('start_utc');
            $table->dateTime('end_utc');
            $table->string('location', 32)->nullable();
            $table->index(['directory_user_id', 'start_utc']);
            $table->index(['directory_user_id', 'end_utc']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('work_hours');
    }
};

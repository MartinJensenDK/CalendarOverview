<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ColorRuleRequest;
use App\Models\ColorRule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ColorRuleController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return $this->all($request);
    }

    public function store(ColorRuleRequest $request): JsonResponse
    {
        $user = $request->user();
        $user->colorRules()->create($request->validated() + ['sort_order' => ((int) $user->colorRules()->max('sort_order')) + 1]);

        return $this->all($request, 201);
    }

    public function update(ColorRuleRequest $request, ColorRule $colorRule): JsonResponse
    {
        abort_unless($colorRule->user_id === $request->user()->id, 404);
        $colorRule->update($request->validated());

        return $this->all($request);
    }

    public function destroy(Request $request, ColorRule $colorRule): JsonResponse
    {
        abort_unless($colorRule->user_id === $request->user()->id, 404);
        $colorRule->delete();

        return $this->all($request);
    }

    public function reorder(Request $request): JsonResponse
    {
        $data = $request->validate(['ids' => ['required', 'array', 'max:200'], 'ids.*' => ['integer']]);
        foreach (array_values($data['ids']) as $i => $id) {
            $request->user()->colorRules()->where('id', $id)->update(['sort_order' => $i]);
        }

        return $this->all($request);
    }

    public function reset(Request $request): JsonResponse
    {
        $user = $request->user();
        $user->colorRules()->delete();
        foreach (ColorRule::defaults() as $i => $rule) {
            $user->colorRules()->create($rule + ['sort_order' => $i, 'enabled' => true]);
        }

        return $this->all($request);
    }

    private function all(Request $request, int $status = 200): JsonResponse
    {
        return response()->json(['color_rules' => $request->user()->colorRules()->get()->map->toArray()->values()], $status);
    }
}

<?php

namespace App\Http\Requests;

use App\Models\ColorRule;
use Closure;
use Illuminate\Foundation\Http\FormRequest;

class ColorRuleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:60'],
            'field' => ['required', 'in:'.implode(',', ColorRule::FIELDS)],
            'operator' => ['required', 'in:'.implode(',', ColorRule::OPERATORS)],
            'value' => ['nullable', 'string', 'max:255', function (string $attribute, mixed $value, Closure $fail) {
                if ($this->input('operator') === 'regex' && $value !== null && @preg_match('/'.str_replace('/', '\/', $value).'/iu', '') === false) {
                    $fail(__('The regular expression is invalid.'));
                }
                if ($this->input('field') === 'status' && ! in_array($value, ColorRule::STATUSES, true)) {
                    $fail(__('Unknown status.'));
                }
            }],
            'color' => ['required', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'text_color' => ['nullable', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'enabled' => ['sometimes', 'boolean'],
        ];
    }
}

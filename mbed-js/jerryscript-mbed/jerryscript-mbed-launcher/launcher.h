/* Copyright JS Foundation and other contributors, http://js.foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
#ifndef _JERRYSCRIPT_MBED_LAUNCHER_LAUNCHER_H
#define _JERRYSCRIPT_MBED_LAUNCHER_LAUNCHER_H

#define SYNTAX_ERROR_CONTEXT_SIZE 2

#include "mbed.h"
#include "jerryscript.h"

void jsmbed_js_launch(void);
void jsmbed_js_exit(void);
void jsmbed_js_print_unhandled_exception(jerry_value_t error_value, /**< error value */
                                         const jerry_char_t *source_p);

#endif  // _JERRYSCRIPT_MBED_LAUNCHER_LAUNCHER_H

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
#include "mbed.h"
#include "rtos.h"

#include "jerry-core/include/jerryscript.h"

#include "jerryscript-mbed-event-loop/EventLoop.h"

#include "jerryscript-mbed-util/js_source.h"
#include "jerryscript-mbed-library-registry/registry.h"

#include "jerryscript-mbed-launcher/launcher.h"
#include "jerryscript-mbed-launcher/setup.h"

#include "jerry-targetjs.h"

DECLARE_JS_CODES;

/**
 * load_javascript
 *
 * Parse and run javascript files specified in jerry-targetjs.h
 */
static int load_javascript() {
    for (int src = 0; js_codes[src].source; src++) {
        LOG_PRINT("running js file %s\r\n", js_codes[src].name);

        const jerry_char_t* code = reinterpret_cast<const jerry_char_t*>(js_codes[src].source);
        const size_t length = js_codes[src].length;

        const jerry_char_t* file_name = reinterpret_cast<const jerry_char_t*>(js_codes[src].name);
        size_t file_name_length = strlen(js_codes[src].name);

        jerry_value_t parsed_code = jerry_parse(file_name, file_name_length,
            code, length, JERRY_PARSE_NO_OPTS);

        if (jerry_value_is_error(parsed_code)) {
            LOG_PRINT_ALWAYS("jerry_parse failed [%s]\r\n", js_codes[src].name);
            jsmbed_js_print_unhandled_exception(parsed_code, code);
            jerry_release_value(parsed_code);
            jsmbed_js_exit();
            return -1;
        }

        jerry_value_t returned_value = jerry_run(parsed_code);
        jerry_release_value(parsed_code);

        if (jerry_value_is_error(returned_value)) {
            LOG_PRINT_ALWAYS("jerry_run failed [%s]\r\n", js_codes[src].name);
            jsmbed_js_print_unhandled_exception(returned_value, code);
            jerry_release_value(returned_value);
            jsmbed_js_exit();
            return -1;
        }

        jerry_release_value(returned_value);
    }

    return 0;
}

static jerry_value_t console_log_handler(
    const jerry_value_t func_value, /**< function object */
    const jerry_value_t this_val, /**< this arg */
    const jerry_value_t *args_p, /**< function arguments */
    const jerry_length_t args_cnt) /**< number of function arguments */
{
    for (size_t ix = 0; ix < args_cnt; ix++) {
        if (ix != 0) {
            printf(", ");
        }

        const jerry_value_t returned_value = args_p[ix];

        jerry_value_t str_value = jerry_value_to_string(returned_value);

        jerry_size_t size = jerry_get_string_size(str_value);

        jerry_char_t* ret_buffer = (jerry_char_t*)calloc(size + 1, 1);

        jerry_string_to_char_buffer(str_value, ret_buffer, size);

        if (jerry_value_is_string(returned_value)) {
            printf("%s", ret_buffer);
        }
        else if (jerry_value_is_array(returned_value)) {
            printf("[%s]", ret_buffer);
        }
        else {
            printf("%s", ret_buffer);
        }

        free(ret_buffer);

        jerry_release_value(str_value);
    }

    printf("\r\n");

    return jerry_create_undefined();
}


void jsmbed_js_create_console_object() {
    // Grab global object
    jerry_value_t global_object = jerry_get_global_object();

    // Create name 'console', which is an object
    jerry_value_t console_prop_name = jerry_create_string((const jerry_char_t *) "console");
    jerry_value_t console = jerry_create_object();

    // log, warn, error names on console object
    jerry_value_t log_name = jerry_create_string((const jerry_char_t *) "log");
    jerry_value_t warn_name = jerry_create_string((const jerry_char_t *) "warn");
    jerry_value_t error_name = jerry_create_string((const jerry_char_t *) "error");

    // pointer to the implementation
    jerry_value_t log_func_obj = jerry_create_external_function(&console_log_handler);

    // attach the function to log/warn/error
    jerry_set_property(console, log_name, log_func_obj);
    jerry_set_property(console, warn_name, log_func_obj);
    jerry_set_property(console, error_name, log_func_obj);

    // attach console to global object
    jerry_set_property(global_object, console_prop_name, console);

    // and free...
    jerry_release_value(log_func_obj);

    jerry_release_value(log_name);
    jerry_release_value(warn_name);
    jerry_release_value(error_name);

    jerry_release_value(console_prop_name);
    jerry_release_value(console);
    jerry_release_value (global_object);
}

int jsmbed_js_init() {
    jerry_init_flag_t flags = JERRY_INIT_EMPTY;
    jerry_init(flags);

    jsmbed_js_load_magic_strings();
    jsmbed_js_create_console_object();
    mbed::js::LibraryRegistry::getInstance().register_all();

    return 0;
}

void jsmbed_js_exit() {
    jerry_cleanup();
}

void jsmbed_js_launch() {
    jsmbed_js_init();

    puts("   Mbed.js\r\n");
    puts("   Build date:  " __DATE__ " \r\n");

    if (load_javascript() == 0) {
        mbed::js::event_loop();
    }
}

void jsmbed_js_print_unhandled_exception (jerry_value_t error_value, /**< error value */
                           const jerry_char_t *source_p) /**< source_p */
{
  if (!jerry_value_is_error (error_value)) return;

  error_value = jerry_get_value_from_error (error_value, false);
  jerry_value_t err_str_val = jerry_value_to_string (error_value);
  jerry_size_t err_str_size = jerry_get_string_size (err_str_val);
  jerry_char_t err_str_buf[256];

  jerry_release_value (error_value);

  if (err_str_size >= 256)
  {
    const char msg[] = "[Error message too long]";
    err_str_size = sizeof (msg) / sizeof (char) - 1;
    memcpy (err_str_buf, msg, err_str_size);
  }
  else
  {
    jerry_size_t sz = jerry_string_to_char_buffer (err_str_val, err_str_buf, err_str_size);
    if (sz != err_str_size) return;
    err_str_buf[err_str_size] = 0;

    if (jerry_is_feature_enabled (JERRY_FEATURE_ERROR_MESSAGES)
        && jerry_get_error_type (error_value) == JERRY_ERROR_SYNTAX)
    {
      uint32_t err_line = 0;
      uint32_t err_col = 0;

      /* 1. parse column and line information */
      for (uint32_t i = 0; i < sz; i++)
      {
        if (!strncmp ((char *) (err_str_buf + i), "[line: ", 7))
        {
          i += 7;

          char num_str[8];
          uint32_t j = 0;

          while (i < sz && err_str_buf[i] != ',')
          {
            num_str[j] = (char) err_str_buf[i];
            j++;
            i++;
          }
          num_str[j] = '\0';

          err_line = atoi (num_str);

          if (strncmp ((char *) (err_str_buf + i), ", column: ", 10))
          {
            break; /* wrong position info format */
          }

          i += 10;
          j = 0;

          while (i < sz && err_str_buf[i] != ']')
          {
            num_str[j] = (char) err_str_buf[i];
            j++;
            i++;
          }
          num_str[j] = '\0';

          err_col = atoi (num_str);
          break;
        }
      } /* for */

      if (err_line != 0 && err_col != 0)
      {
        uint32_t curr_line = 1;

        bool is_printing_context = false;
        uint32_t pos = 0;

        /* 2. seek and print */
        while (source_p[pos] != '\0')
        {
          if (source_p[pos] == '\n')
          {
            curr_line++;
          }

          if (err_line < SYNTAX_ERROR_CONTEXT_SIZE
              || (err_line >= curr_line
                  && (err_line - curr_line) <= SYNTAX_ERROR_CONTEXT_SIZE))
          {
            /* context must be printed */
            is_printing_context = true;
          }

          if (curr_line > err_line)
          {
            break;
          }

          if (is_printing_context)
          {
            jerry_port_log (JERRY_LOG_LEVEL_ERROR, "%c", source_p[pos]);
          }

          pos++;
        }

        jerry_port_log (JERRY_LOG_LEVEL_ERROR, "\n");

        while (--err_col)
        {
          jerry_port_log (JERRY_LOG_LEVEL_ERROR, "~");
        }

        jerry_port_log (JERRY_LOG_LEVEL_ERROR, "^\n");
      }
    }
  }

  jerry_port_log (JERRY_LOG_LEVEL_ERROR, "Script Error: %s\n", err_str_buf);
  jerry_release_value (err_str_val);
}

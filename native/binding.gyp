{
  "targets": [
    {
      "target_name": "scheduler_native",
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "conditions": [
        ['OS=="win"', {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "AdditionalOptions": [ "/openmp" ]
            }
          }
        }],
        ['OS=="mac"', {
          "xcode_settings": {
            "OTHER_CPLUSPLUSFLAGS": [ "-Xpreprocessor", "-fopenmp" ],
            "OTHER_LDFLAGS": [ "-lomp" ]
          }
        }],
        ['OS=="linux"', {
          "cflags_cc": [ "-fopenmp" ],
          "ldflags": [ "-fopenmp" ]
        }]
      ],
      "sources": [ "scheduler.cc", "scheduler_wrapper.cc" ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      'defines': [ 'NAPI_DISABLE_CPP_EXCEPTIONS' ],
    }
  ]
}

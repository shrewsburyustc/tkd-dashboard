// rubricDefault.js — the DEFAULT Black Belt rubric as migration 0024 seeds it (schema_version 2).
// Why it exists: 0024 seeds one row in public.bb_default_rubric: the Fall 2026 starting point's
// requirements sheet (startingPoint.js, v1) converted to the v2 shape by bb_rubric_from_v1, with
// no number changed (contract 0024 §4). The preview database (mockBlackBelt.js) starts from this
// copy, so preview shows what the real database will hold. Two checks keep it honest:
//   - checks.mjs: rubricFromV1(STARTING_POINT_REQUIREMENTS) (the JS twin of the conversion in
//     rubric.js) deep-equals this object, and the CP1-approved numbers are spot-checked;
//   - PGlite (supabase/tests/pglite/run.mjs, step0024 h): the migration's seeded
//     bb_default_rubric.sheet deep-equals this object.
// So a change to the seed must be made in the migration AND here.
//
// What is in it: per Dan a pass-mark bracket list (1st Dan: 17 and under 275 / 18 and over 293),
// the four parts with that Dan's grade points (four identical copies of the Fall 2026 scales;
// Other = a copy of Technical's), each subject with a stable 8-character id
// (left(md5(dan || '/' || code || '/' || name), 8)), its stored points, and points_mode 'own' for
// the 19 subjects whose Fall 2026 points don't follow credits x grade points (v0.924).
// rev 1 and no "saved by" stamps: nobody has saved a Dan yet.
//
// Imported only by the preview database and checks.mjs (never by the live build's screens).

export const DEFAULT_RUBRIC = {
  "schema_version": 2,
  "source": "Fall 2026 (old Sheet)",
  "dans": [
    {
      "dan": 1,
      "rev": 1,
      "saved_at": null,
      "saved_by_name": null,
      "pass": {
        "brackets": [{"from":null,"to":17,"pass_mark":275},{"from":18,"to":null,"pass_mark":293}],
        "no_d": true,
        "makeup": "A subject graded D is made up at the next testing, even if the total passes."
      },
      "parts": [
        {
          "code": "physical",
          "name": "Physical",
          "grade_points": {"A+":4,"A":3.5,"B+":3,"B":2.5,"C":2,"D":0},
          "subjects": [
            {
              "id": "ec806b43",
              "name": "Stretching",
              "credits": 3,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "inches",
                  "direction": "at_least",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":4,"A":3.5,"B+":3,"B":2.5,"C":2}},
                    {"from":9,"to":12,"cutoffs":{"A+":6,"A":5,"B+":4,"B":3,"C":2}},
                    {"from":13,"to":null,"cutoffs":{"A+":8,"A":6,"B+":5,"B":4,"C":2}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":12,"A":10.5,"B+":9,"B":7.5,"C":6,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "38b5cd9f",
              "name": "Sit-up (20 sec)",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "count",
                  "direction": "at_least",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":18,"A":16,"B+":11,"B":6,"C":4}},
                    {"from":9,"to":12,"cutoffs":{"A+":20,"A":18,"B+":15,"B":10,"C":4}},
                    {"from":13,"to":null,"cutoffs":{"A+":23,"A":20,"B+":18,"B":15,"C":6}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "b7e19759",
              "name": "Push-up (1 min)",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "count",
                  "direction": "at_least",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":20,"A":18,"B+":16,"B":14,"C":12}},
                    {"from":9,"to":12,"cutoffs":{"A+":36,"A":30,"B+":25,"B":20,"C":15}},
                    {"from":13,"to":null,"cutoffs":{"A+":50,"A":40,"B+":30,"B":25,"C":20}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "435f76cf",
              "name": "Static jump",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "inches",
                  "direction": "at_least",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":12,"A":10,"B+":9,"B":7,"C":3}},
                    {"from":9,"to":12,"cutoffs":{"A+":18,"A":15,"B+":13,"B":10,"C":5}},
                    {"from":13,"to":null,"cutoffs":{"A+":23,"A":20,"B+":18,"B":15,"C":10}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "5e91e6a9",
              "name": "Long jump",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "inches (feet x 12 + inches)",
                  "direction": "at_least",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":72,"A":60,"B+":54,"B":48,"C":36}},
                    {"from":9,"to":12,"cutoffs":{"A+":84,"A":72,"B+":66,"B":60,"C":48}},
                    {"from":13,"to":null,"cutoffs":{"A+":96,"A":84,"B+":78,"B":72,"C":60}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "b53843bc",
              "name": "Sprint 4x10 m",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "seconds",
                  "direction": "at_most",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":10,"A":12,"B+":13,"B":14,"C":16}},
                    {"from":9,"to":12,"cutoffs":{"A+":9,"A":11,"B+":12,"B":13,"C":15}},
                    {"from":13,"to":null,"cutoffs":{"A+":8,"A":10,"B+":11,"B":12,"C":14}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "ef1254f8",
              "name": "Pull-up or hold",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": "Pull-up",
                  "unit": "reps",
                  "direction": "at_least",
                  "brackets": [
                    {"from":null,"to":12,"cutoffs":{"A+":6,"A":5,"B+":3,"B":2,"C":1}},
                    {"from":13,"to":null,"cutoffs":{"A+":10,"A":8,"B+":6,"B":4,"C":2}}
                  ]
                },
                {
                  "name": "Hold",
                  "unit": "seconds",
                  "direction": "at_least",
                  "brackets": [{"from":null,"to":null,"cutoffs":{"A+":31,"A":26,"B+":21,"B":11,"C":9}}]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": true,
              "handed_in": false,
              "note": null
            },
            {
              "id": "3dd99b9f",
              "name": "Sprint 100 m",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "seconds",
                  "direction": "under",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":18,"A":20,"B+":22,"B":24,"C":28}},
                    {"from":9,"to":12,"cutoffs":{"A+":15,"A":17,"B+":19,"B":21,"C":24}},
                    {"from":13,"to":null,"cutoffs":{"A+":14,"A":15,"B+":16,"B":17,"C":23}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": true,
              "handed_in": false,
              "note": null
            },
            {
              "id": "5accced1",
              "name": "1/2 or 1 mile",
              "credits": 3,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "minutes",
                  "direction": "at_most",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":5,"A":6,"B+":6.5,"B":7,"C":8}},
                    {"from":9,"to":12,"cutoffs":{"A+":4,"A":5,"B+":5.5,"B":6,"C":7}},
                    {"from":13,"to":null,"cutoffs":{"A+":8,"A":8.5,"B+":9,"B":11,"C":12}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":12,"A":10.5,"B+":9,"B":7.5,"C":6,"D":0},
              "limited_to": null,
              "outdoor": true,
              "handed_in": false,
              "note": "1/2 mile for 12 and under, 1 mile for 13 and over"
            }
          ]
        },
        {
          "code": "technical",
          "name": "Technical",
          "grade_points": {"A+":4,"A":3.5,"A-":3.25,"B+":3,"B":2.5,"B-":2.25,"C":2,"C-":1,"D":0},
          "subjects": [
            {
              "id": "88de8004",
              "name": "Referee seminar",
              "credits": 2,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"A-":6.5,"B+":6,"B":5,"B-":4.5,"C":4,"C-":2,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "f2630888",
              "name": "Free sparring",
              "credits": 3,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":12,"A":10.5,"A-":9.75,"B+":9,"B":7.5,"B-":6.75,"C":6,"C-":3,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "ab9209e1",
              "name": "Target kick (30 sec)",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "kicks in 30 seconds",
                  "direction": "at_least",
                  "brackets": [
                    {"from":null,"to":9,"cutoffs":{"A+":35,"A":31,"B+":26,"B":22,"C":21}},
                    {"from":10,"to":null,"cutoffs":{"A+":39,"A":34,"B+":29,"B":24,"C":23}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "24280b75",
              "name": "Korean terminology",
              "credits": 2,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"A-":6.5,"B+":6,"B":5,"B-":4.5,"C":4,"C-":2,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "8620a413",
              "name": "TKD knowledge",
              "credits": 2,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"A-":6.5,"B+":6,"B":5,"B-":4.5,"C":4,"C-":2,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            }
          ]
        },
        {
          "code": "curriculum",
          "name": "Curriculum",
          "grade_points": {"A+":4.5,"A":4,"A-":3.8,"B+":3.5,"B":3.3,"B-":3,"C":2.5,"C-":2,"D":0},
          "subjects": [
            {
              "id": "d5bf66fd",
              "name": "Basic 10 Motions (1-7)",
              "credits": 5,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":22.5,"A":20,"A-":19,"B+":17.5,"B":16.5,"B-":15,"C":12.5,"C-":10,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "522a5a06",
              "name": "Tae-Geuk Poomsae (1-8)",
              "credits": 5,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":22.5,"A":20,"A-":19,"B+":17.5,"B":16.5,"B-":15,"C":12.5,"C-":10,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "d16684a5",
              "name": "Sa Bang Chuck (1-13)",
              "credits": 5,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":22.5,"A":20,"A-":19,"B+":17.5,"B":16.5,"B-":15,"C":12.5,"C-":10,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "fe78294a",
              "name": "One Step Sparring (1-24)",
              "credits": 5,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":22.5,"A":20,"A-":19,"B+":17.5,"B":16.5,"B-":15,"C":12.5,"C-":10,"D":0},
              "limited_to": [{"from":18,"to":null}],
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "7dd13946",
              "name": "Technical Break",
              "credits": 5,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":22.5,"A":20,"A-":19,"B+":17.5,"B":16.5,"B-":15,"C":12.5,"C-":10,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "dc32f7c3",
              "name": "Power Break",
              "credits": 5,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":22.5,"A":20,"A-":19,"B+":17.5,"B":16.5,"B-":15,"C":12.5,"C-":10,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "31683485",
              "name": "Self-Defense",
              "credits": 5,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":22.5,"A":20,"A-":19,"B+":17.5,"B":16.5,"B-":15,"C":12.5,"C-":10,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            }
          ]
        },
        {
          "code": "other",
          "name": "Other requirements",
          "grade_points": {"A+":4,"A":3.5,"A-":3.25,"B+":3,"B":2.5,"B-":2.25,"C":2,"C-":1,"D":0},
          "subjects": [
            {
              "id": "574ce43c",
              "name": "Egg test",
              "credits": 5,
              "scoring": "graded",
              "ways": [],
              "points_mode": "own",
              "points": {"A+":20,"A":17.5,"A-":16.25,"B+":15,"B":11,"B-":10.5,"C":10,"C-":5,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": true,
              "note": null
            },
            {
              "id": "5896c437",
              "name": "Meditation",
              "credits": 4,
              "scoring": "graded",
              "ways": [],
              "points_mode": "own",
              "points": {"A+":16,"A":14,"A-":13,"B+":12,"B":9,"B-":8.5,"C":8,"C-":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": true,
              "note": null
            },
            {
              "id": "7b07c0cc",
              "name": "Assistant instructor course",
              "credits": 5,
              "scoring": "graded",
              "ways": [],
              "points_mode": "own",
              "points": {"A+":20,"A":17.5,"A-":16.25,"B+":15,"B":11,"B-":10.5,"C":10,"C-":5,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "6f5c13b7",
              "name": "Appreciation letter",
              "credits": 2,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"A-":6.5,"B+":6,"B":5,"B-":4.5,"C":4,"C-":2,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": true,
              "note": null
            },
            {
              "id": "2ab87e21",
              "name": "TKD project",
              "credits": 4,
              "scoring": "graded",
              "ways": [],
              "points_mode": "own",
              "points": {"A+":16,"A":14,"A-":13,"B+":12,"B":9,"B-":8.5,"C":8,"C-":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": true,
              "note": null
            }
          ]
        }
      ],
      "extra_points": {
        "counts_toward_total": true,
        "limit": null,
        "to_confirm": true,
        "note": null,
        "items": [
          {"name":"Extra stripes","rule":{"kind":"per_count","points_each":1}},
          {"name":"Outstanding performance","rule":{"kind":"steps","steps":[{"at_least":5,"points":5}]}},
          {
            "name": "Competitions",
            "rule": {
              "kind": "steps",
              "steps": [
                {"at_least":1,"points":3},
                {"at_least":2,"points":5},
                {"at_least":3,"points":7},
                {"at_least":4,"points":10},
                {"at_least":5,"points":15}
              ]
            }
          },
          {
            "name": "Attendance (classes)",
            "rule": {
              "kind": "steps",
              "steps": [{"at_least":320,"points":3},{"at_least":375,"points":5},{"at_least":400,"points":10}]
            }
          },
          {
            "name": "Special events",
            "rule": {
              "kind": "steps",
              "steps": [{"at_least":3,"points":3},{"at_least":6,"points":5},{"at_least":10,"points":10}]
            }
          },
          {
            "name": "Breaking class",
            "rule": {
              "kind": "steps",
              "steps": [{"at_least":16,"points":3},{"at_least":20,"points":5},{"at_least":25,"points":10}]
            }
          }
        ]
      }
    },
    {
      "dan": 2,
      "rev": 1,
      "saved_at": null,
      "saved_by_name": null,
      "pass": {
        "brackets": [{"from":null,"to":null,"pass_mark":261}],
        "no_d": true,
        "makeup": "A subject graded D is made up at the next testing, even if the total passes."
      },
      "parts": [
        {
          "code": "physical",
          "name": "Physical",
          "grade_points": {"A+":4,"A":3.5,"B+":3,"B":2.5,"C":2,"D":0},
          "subjects": [
            {
              "id": "88782efd",
              "name": "Stretching",
              "credits": 3,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "inches",
                  "direction": "at_least",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":4,"A":3.5,"B+":3,"B":2.5,"C":2}},
                    {"from":9,"to":12,"cutoffs":{"A+":6,"A":5,"B+":4,"B":3,"C":2}},
                    {"from":13,"to":null,"cutoffs":{"A+":8,"A":6,"B+":5,"B":4,"C":2}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":12,"A":10.5,"B+":9,"B":7.5,"C":6,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "3458194b",
              "name": "Sit-up (20 sec)",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "count",
                  "direction": "at_least",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":18,"A":16,"B+":11,"B":6,"C":4}},
                    {"from":9,"to":12,"cutoffs":{"A+":20,"A":18,"B+":15,"B":10,"C":4}},
                    {"from":13,"to":null,"cutoffs":{"A+":23,"A":20,"B+":18,"B":15,"C":6}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "bda05912",
              "name": "Push-up (1 min)",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "count",
                  "direction": "at_least",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":20,"A":18,"B+":16,"B":14,"C":12}},
                    {"from":9,"to":12,"cutoffs":{"A+":36,"A":30,"B+":25,"B":20,"C":15}},
                    {"from":13,"to":null,"cutoffs":{"A+":50,"A":40,"B+":30,"B":25,"C":20}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "f2939df4",
              "name": "Static jump",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "inches",
                  "direction": "at_least",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":12,"A":10,"B+":9,"B":7,"C":3}},
                    {"from":9,"to":12,"cutoffs":{"A+":18,"A":15,"B+":13,"B":10,"C":5}},
                    {"from":13,"to":null,"cutoffs":{"A+":23,"A":20,"B+":18,"B":15,"C":10}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "9f0f771f",
              "name": "Long jump",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "inches (feet x 12 + inches)",
                  "direction": "at_least",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":72,"A":60,"B+":54,"B":48,"C":36}},
                    {"from":9,"to":12,"cutoffs":{"A+":84,"A":72,"B+":66,"B":60,"C":48}},
                    {"from":13,"to":null,"cutoffs":{"A+":96,"A":84,"B+":78,"B":72,"C":60}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "56ce109b",
              "name": "Sprint 4x10 m",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "seconds",
                  "direction": "at_most",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":10,"A":12,"B+":13,"B":14,"C":16}},
                    {"from":9,"to":12,"cutoffs":{"A+":9,"A":11,"B+":12,"B":13,"C":15}},
                    {"from":13,"to":null,"cutoffs":{"A+":8,"A":10,"B+":11,"B":12,"C":14}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "30a73415",
              "name": "Pull-up or hold",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": "Pull-up",
                  "unit": "reps",
                  "direction": "at_least",
                  "brackets": [
                    {"from":null,"to":12,"cutoffs":{"A+":6,"A":5,"B+":3,"B":2,"C":1}},
                    {"from":13,"to":null,"cutoffs":{"A+":10,"A":8,"B+":6,"B":4,"C":2}}
                  ]
                },
                {
                  "name": "Hold",
                  "unit": "seconds",
                  "direction": "at_least",
                  "brackets": [{"from":null,"to":null,"cutoffs":{"A+":31,"A":26,"B+":21,"B":11,"C":9}}]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": true,
              "handed_in": false,
              "note": null
            },
            {
              "id": "bc785353",
              "name": "Sprint 100 m",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "seconds",
                  "direction": "under",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":18,"A":20,"B+":22,"B":24,"C":28}},
                    {"from":9,"to":12,"cutoffs":{"A+":15,"A":17,"B+":19,"B":21,"C":24}},
                    {"from":13,"to":null,"cutoffs":{"A+":14,"A":15,"B+":16,"B":17,"C":23}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": true,
              "handed_in": false,
              "note": null
            },
            {
              "id": "c10c07d9",
              "name": "1/2 or 1 mile",
              "credits": 3,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "minutes",
                  "direction": "at_most",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":5,"A":6,"B+":6.5,"B":7,"C":8}},
                    {"from":9,"to":12,"cutoffs":{"A+":4,"A":5,"B+":5.5,"B":6,"C":7}},
                    {"from":13,"to":null,"cutoffs":{"A+":8,"A":8.5,"B+":9,"B":11,"C":12}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":12,"A":10.5,"B+":9,"B":7.5,"C":6,"D":0},
              "limited_to": null,
              "outdoor": true,
              "handed_in": false,
              "note": "1/2 mile for 12 and under, 1 mile for 13 and over"
            }
          ]
        },
        {
          "code": "technical",
          "name": "Technical",
          "grade_points": {"A+":4,"A":3.5,"A-":3.25,"B+":3,"B":2.5,"B-":2.25,"C":2,"C-":1,"D":0},
          "subjects": [
            {
              "id": "46d29c95",
              "name": "Referee seminar",
              "credits": 2,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"A-":6.5,"B+":6,"B":5,"B-":4.5,"C":4,"C-":2,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "6006bb0f",
              "name": "Free sparring",
              "credits": 3,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":12,"A":10.5,"A-":9.75,"B+":9,"B":7.5,"B-":6.75,"C":6,"C-":3,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "7cd90c2d",
              "name": "Target kick (30 sec)",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "kicks in 30 seconds",
                  "direction": "at_least",
                  "brackets": [
                    {"from":null,"to":9,"cutoffs":{"A+":35,"A":31,"B+":26,"B":22,"C":21}},
                    {"from":10,"to":null,"cutoffs":{"A+":39,"A":34,"B+":29,"B":24,"C":23}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "bb9316b8",
              "name": "Korean terminology",
              "credits": 2,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"A-":6.5,"B+":6,"B":5,"B-":4.5,"C":4,"C-":2,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "098df542",
              "name": "TKD knowledge",
              "credits": 2,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"A-":6.5,"B+":6,"B":5,"B-":4.5,"C":4,"C-":2,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            }
          ]
        },
        {
          "code": "curriculum",
          "name": "Curriculum",
          "grade_points": {"A+":4.5,"A":4,"A-":3.8,"B+":3.5,"B":3.3,"B-":3,"C":2.5,"C-":2,"D":0},
          "subjects": [
            {
              "id": "4300c41c",
              "name": "White-Bodan Curriculum",
              "credits": 10,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":45,"A":40,"A-":38,"B+":35,"B":33,"B-":30,"C":25,"C-":20,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "bd9c37a4",
              "name": "Go-Ryo Poomsae",
              "credits": 3,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":13.5,"A":12,"A-":11.4,"B+":10.5,"B":9.9,"B-":9,"C":7.5,"C-":6,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "7401f449",
              "name": "Advance 10 Motion (1-5)",
              "credits": 3,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":13.5,"A":12,"A-":11.4,"B+":10.5,"B":9.9,"B-":9,"C":7.5,"C-":6,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "8ca94570",
              "name": "Advance Sa Bang Chuck (1-5)",
              "credits": 3,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":13.5,"A":12,"A-":11.4,"B+":10.5,"B":9.9,"B-":9,"C":7.5,"C-":6,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "b5092201",
              "name": "Step Sa Bang Chuck (1-5)",
              "credits": 3,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":13.5,"A":12,"A-":11.4,"B+":10.5,"B":9.9,"B-":9,"C":7.5,"C-":6,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "4691d5eb",
              "name": "Power Break",
              "credits": 3,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":13.5,"A":12,"A-":11.4,"B+":10.5,"B":9.9,"B-":9,"C":7.5,"C-":6,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "de91a496",
              "name": "Technical Break",
              "credits": 3,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":13.5,"A":12,"A-":11.4,"B+":10.5,"B":9.9,"B-":9,"C":7.5,"C-":6,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "1ad78dc6",
              "name": "Two Step Sparring (1-10)",
              "credits": 3,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":13.5,"A":12,"A-":11.4,"B+":10.5,"B":9.9,"B-":9,"C":7.5,"C-":6,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            }
          ]
        },
        {
          "code": "other",
          "name": "Other requirements",
          "grade_points": {"A+":4,"A":3.5,"A-":3.25,"B+":3,"B":2.5,"B-":2.25,"C":2,"C-":1,"D":0},
          "subjects": [
            {
              "id": "65e21d80",
              "name": "Egg test",
              "credits": 5,
              "scoring": "graded",
              "ways": [],
              "points_mode": "own",
              "points": {"A+":20,"A":17.5,"A-":16.25,"B+":15,"B":11,"B-":10.5,"C":10,"C-":5,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": true,
              "note": null
            },
            {
              "id": "9bbecfd5",
              "name": "Meditation",
              "credits": 4,
              "scoring": "graded",
              "ways": [],
              "points_mode": "own",
              "points": {"A+":16,"A":14,"A-":13,"B+":12,"B":9,"B-":8.5,"C":8,"C-":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": true,
              "note": null
            },
            {
              "id": "982839cc",
              "name": "Assistant instructor course",
              "credits": 5,
              "scoring": "graded",
              "ways": [],
              "points_mode": "own",
              "points": {"A+":20,"A":17.5,"A-":16.25,"B+":15,"B":11,"B-":10.5,"C":10,"C-":5,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "592d0502",
              "name": "Appreciation letter",
              "credits": 2,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"A-":6.5,"B+":6,"B":5,"B-":4.5,"C":4,"C-":2,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": true,
              "note": null
            },
            {
              "id": "ca36bfac",
              "name": "TKD project",
              "credits": 4,
              "scoring": "graded",
              "ways": [],
              "points_mode": "own",
              "points": {"A+":16,"A":14,"A-":13,"B+":12,"B":9,"B-":8.5,"C":8,"C-":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": true,
              "note": null
            }
          ]
        }
      ],
      "extra_points": {
        "counts_toward_total": true,
        "limit": null,
        "to_confirm": true,
        "note": null,
        "items": [
          {"name":"Extra stripes","rule":{"kind":"per_count","points_each":1}},
          {"name":"Outstanding performance","rule":{"kind":"steps","steps":[{"at_least":4,"points":5}]}},
          {
            "name": "Competitions",
            "rule": {
              "kind": "steps",
              "steps": [
                {"at_least":1,"points":3},
                {"at_least":2,"points":5},
                {"at_least":3,"points":7},
                {"at_least":4,"points":10},
                {"at_least":5,"points":15}
              ]
            }
          },
          {
            "name": "Attendance (classes)",
            "rule": {
              "kind": "steps",
              "steps": [{"at_least":250,"points":3},{"at_least":271,"points":5},{"at_least":300,"points":10}]
            }
          },
          {
            "name": "Special events",
            "rule": {
              "kind": "steps",
              "steps": [{"at_least":3,"points":3},{"at_least":6,"points":5},{"at_least":10,"points":10}]
            }
          },
          {
            "name": "Breaking class",
            "rule": {
              "kind": "steps",
              "steps": [{"at_least":11,"points":3},{"at_least":17,"points":5},{"at_least":21,"points":10}]
            }
          }
        ]
      }
    },
    {
      "dan": 3,
      "rev": 1,
      "saved_at": null,
      "saved_by_name": null,
      "pass": {
        "brackets": [{"from":null,"to":null,"pass_mark":293}],
        "no_d": true,
        "makeup": "A subject graded D is made up at the next testing, even if the total passes."
      },
      "parts": [
        {
          "code": "physical",
          "name": "Physical",
          "grade_points": {"A+":4,"A":3.5,"B+":3,"B":2.5,"C":2,"D":0},
          "subjects": [
            {
              "id": "ecf8b62f",
              "name": "Stretching",
              "credits": 3,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "inches",
                  "direction": "at_least",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":4,"A":3.5,"B+":3,"B":2.5,"C":2}},
                    {"from":9,"to":12,"cutoffs":{"A+":6,"A":5,"B+":4,"B":3,"C":2}},
                    {"from":13,"to":null,"cutoffs":{"A+":8,"A":6,"B+":5,"B":4,"C":2}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":12,"A":10.5,"B+":9,"B":7.5,"C":6,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "4de30043",
              "name": "Sit-up (20 sec)",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "count",
                  "direction": "at_least",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":18,"A":16,"B+":11,"B":6,"C":4}},
                    {"from":9,"to":12,"cutoffs":{"A+":20,"A":18,"B+":15,"B":10,"C":4}},
                    {"from":13,"to":null,"cutoffs":{"A+":23,"A":20,"B+":18,"B":15,"C":6}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "be9e7846",
              "name": "Push-up (1 min)",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "count",
                  "direction": "at_least",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":20,"A":18,"B+":16,"B":14,"C":12}},
                    {"from":9,"to":12,"cutoffs":{"A+":36,"A":30,"B+":25,"B":20,"C":15}},
                    {"from":13,"to":null,"cutoffs":{"A+":50,"A":40,"B+":30,"B":25,"C":20}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "772e00b6",
              "name": "Static jump",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "inches",
                  "direction": "at_least",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":12,"A":10,"B+":9,"B":7,"C":3}},
                    {"from":9,"to":12,"cutoffs":{"A+":18,"A":15,"B+":13,"B":10,"C":5}},
                    {"from":13,"to":null,"cutoffs":{"A+":23,"A":20,"B+":18,"B":15,"C":10}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "eab1bc07",
              "name": "Long jump",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "inches (feet x 12 + inches)",
                  "direction": "at_least",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":72,"A":60,"B+":54,"B":48,"C":36}},
                    {"from":9,"to":12,"cutoffs":{"A+":84,"A":72,"B+":66,"B":60,"C":48}},
                    {"from":13,"to":null,"cutoffs":{"A+":96,"A":84,"B+":78,"B":72,"C":60}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "1b3993c3",
              "name": "Sprint 4x10 m",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "seconds",
                  "direction": "at_most",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":10,"A":12,"B+":13,"B":14,"C":16}},
                    {"from":9,"to":12,"cutoffs":{"A+":9,"A":11,"B+":12,"B":13,"C":15}},
                    {"from":13,"to":null,"cutoffs":{"A+":8,"A":10,"B+":11,"B":12,"C":14}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "15dc15b2",
              "name": "Pull-up or hold",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": "Pull-up",
                  "unit": "reps",
                  "direction": "at_least",
                  "brackets": [
                    {"from":null,"to":12,"cutoffs":{"A+":6,"A":5,"B+":3,"B":2,"C":1}},
                    {"from":13,"to":null,"cutoffs":{"A+":10,"A":8,"B+":6,"B":4,"C":2}}
                  ]
                },
                {
                  "name": "Hold",
                  "unit": "seconds",
                  "direction": "at_least",
                  "brackets": [{"from":null,"to":null,"cutoffs":{"A+":31,"A":26,"B+":21,"B":11,"C":9}}]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": true,
              "handed_in": false,
              "note": null
            },
            {
              "id": "9b173050",
              "name": "Sprint 100 m",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "seconds",
                  "direction": "under",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":18,"A":20,"B+":22,"B":24,"C":28}},
                    {"from":9,"to":12,"cutoffs":{"A+":15,"A":17,"B+":19,"B":21,"C":24}},
                    {"from":13,"to":null,"cutoffs":{"A+":14,"A":15,"B+":16,"B":17,"C":23}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": true,
              "handed_in": false,
              "note": null
            },
            {
              "id": "b56dd03e",
              "name": "1/2 or 1 mile",
              "credits": 3,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "minutes",
                  "direction": "at_most",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":5,"A":6,"B+":6.5,"B":7,"C":8}},
                    {"from":9,"to":12,"cutoffs":{"A+":4,"A":5,"B+":5.5,"B":6,"C":7}},
                    {"from":13,"to":null,"cutoffs":{"A+":8,"A":8.5,"B+":9,"B":11,"C":12}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":12,"A":10.5,"B+":9,"B":7.5,"C":6,"D":0},
              "limited_to": null,
              "outdoor": true,
              "handed_in": false,
              "note": "1/2 mile for 12 and under, 1 mile for 13 and over"
            }
          ]
        },
        {
          "code": "technical",
          "name": "Technical",
          "grade_points": {"A+":4,"A":3.5,"A-":3.25,"B+":3,"B":2.5,"B-":2.25,"C":2,"C-":1,"D":0},
          "subjects": [
            {
              "id": "46d080a6",
              "name": "Referee seminar",
              "credits": 2,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"A-":6.5,"B+":6,"B":5,"B-":4.5,"C":4,"C-":2,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "20711eb2",
              "name": "Free sparring",
              "credits": 3,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":12,"A":10.5,"A-":9.75,"B+":9,"B":7.5,"B-":6.75,"C":6,"C-":3,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "d94bb071",
              "name": "Target kick (30 sec)",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "kicks in 30 seconds",
                  "direction": "at_least",
                  "brackets": [
                    {"from":null,"to":9,"cutoffs":{"A+":35,"A":31,"B+":26,"B":22,"C":21}},
                    {"from":10,"to":null,"cutoffs":{"A+":39,"A":34,"B+":29,"B":24,"C":23}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "d2b4bb0d",
              "name": "Korean terminology",
              "credits": 2,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"A-":6.5,"B+":6,"B":5,"B-":4.5,"C":4,"C-":2,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "04eadac1",
              "name": "TKD knowledge",
              "credits": 2,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"A-":6.5,"B+":6,"B":5,"B-":4.5,"C":4,"C-":2,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            }
          ]
        },
        {
          "code": "curriculum",
          "name": "Curriculum",
          "grade_points": {"A+":4.5,"A":4,"A-":3.8,"B+":3.5,"B":3.3,"B-":3,"C":2.5,"C-":2,"D":0},
          "subjects": [
            {
              "id": "2f50f893",
              "name": "White-Bodan Curriculum",
              "credits": 10,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":45,"A":40,"A-":38,"B+":35,"B":33,"B-":30,"C":25,"C-":20,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "c238815a",
              "name": "Geum Gang Poomsae",
              "credits": 5,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":22.5,"A":20,"A-":19,"B+":17.5,"B":16.5,"B-":15,"C":12.5,"C-":10,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "e9c6dfbf",
              "name": "1st Dan Curriculum",
              "credits": 10,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":45,"A":40,"A-":38,"B+":35,"B":33,"B-":30,"C":25,"C-":20,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "9079236f",
              "name": "2nd Dan Sa Bang Chuck (1-4)",
              "credits": 3,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":13.5,"A":12,"A-":11.4,"B+":10.5,"B":9.9,"B-":9,"C":7.5,"C-":6,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "866afbdb",
              "name": "Creative Poomsae",
              "credits": 3,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":13.5,"A":12,"A-":11.4,"B+":10.5,"B":9.9,"B-":9,"C":7.5,"C-":6,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "c3aa25e1",
              "name": "Creative Sa Bang Chuck",
              "credits": 3,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":13.5,"A":12,"A-":11.4,"B+":10.5,"B":9.9,"B-":9,"C":7.5,"C-":6,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "3b5f6219",
              "name": "Technical Break",
              "credits": 3,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":13.5,"A":12,"A-":11.4,"B+":10.5,"B":9.9,"B-":9,"C":7.5,"C-":6,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "d34904e4",
              "name": "Power Break",
              "credits": 3,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":13.5,"A":12,"A-":11.4,"B+":10.5,"B":9.9,"B-":9,"C":7.5,"C-":6,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            }
          ]
        },
        {
          "code": "other",
          "name": "Other requirements",
          "grade_points": {"A+":4,"A":3.5,"A-":3.25,"B+":3,"B":2.5,"B-":2.25,"C":2,"C-":1,"D":0},
          "subjects": [
            {
              "id": "fd8d3b51",
              "name": "Egg test",
              "credits": 5,
              "scoring": "graded",
              "ways": [],
              "points_mode": "own",
              "points": {"A+":20,"A":17.5,"A-":16.25,"B+":15,"B":11,"B-":10.5,"C":10,"C-":5,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": true,
              "note": null
            },
            {
              "id": "af8ce847",
              "name": "Meditation",
              "credits": 4,
              "scoring": "graded",
              "ways": [],
              "points_mode": "own",
              "points": {"A+":16,"A":14,"A-":13,"B+":12,"B":9,"B-":8.5,"C":8,"C-":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": true,
              "note": null
            },
            {
              "id": "c6301785",
              "name": "Assistant instructor course",
              "credits": 5,
              "scoring": "graded",
              "ways": [],
              "points_mode": "own",
              "points": {"A+":20,"A":17.5,"A-":16.25,"B+":15,"B":11,"B-":10.5,"C":10,"C-":5,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "de448912",
              "name": "Appreciation letter",
              "credits": 2,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"A-":6.5,"B+":6,"B":5,"B-":4.5,"C":4,"C-":2,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": true,
              "note": null
            },
            {
              "id": "8550fa6d",
              "name": "TKD project",
              "credits": 4,
              "scoring": "graded",
              "ways": [],
              "points_mode": "own",
              "points": {"A+":16,"A":14,"A-":13,"B+":12,"B":9,"B-":8.5,"C":8,"C-":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": true,
              "note": null
            }
          ]
        }
      ],
      "extra_points": {
        "counts_toward_total": true,
        "limit": null,
        "to_confirm": true,
        "note": null,
        "items": [
          {"name":"Extra stripes","rule":{"kind":"per_count","points_each":1}},
          {"name":"Outstanding performance","rule":{"kind":"steps","steps":[{"at_least":3,"points":5}]}},
          {
            "name": "Competitions",
            "rule": {
              "kind": "steps",
              "steps": [
                {"at_least":1,"points":3},
                {"at_least":2,"points":5},
                {"at_least":3,"points":7},
                {"at_least":4,"points":10},
                {"at_least":5,"points":15}
              ]
            }
          },
          {
            "name": "Attendance (classes)",
            "rule": {
              "kind": "steps",
              "steps": [{"at_least":210,"points":3},{"at_least":231,"points":5},{"at_least":250,"points":10}]
            }
          },
          {
            "name": "Special events",
            "rule": {
              "kind": "steps",
              "steps": [{"at_least":3,"points":3},{"at_least":6,"points":5},{"at_least":10,"points":10}]
            }
          },
          {
            "name": "Breaking class",
            "rule": {
              "kind": "steps",
              "steps": [{"at_least":11,"points":3},{"at_least":17,"points":5},{"at_least":21,"points":10}]
            }
          }
        ]
      }
    },
    {
      "dan": 4,
      "rev": 1,
      "saved_at": null,
      "saved_by_name": null,
      "pass": {
        "brackets": [{"from":null,"to":null,"pass_mark":453}],
        "no_d": true,
        "makeup": "A subject graded D is made up at the next testing, even if the total passes."
      },
      "parts": [
        {
          "code": "physical",
          "name": "Physical",
          "grade_points": {"A+":4,"A":3.5,"B+":3,"B":2.5,"C":2,"D":0},
          "subjects": [
            {
              "id": "dad0838d",
              "name": "Stretching",
              "credits": 3,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "inches",
                  "direction": "at_least",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":4,"A":3.5,"B+":3,"B":2.5,"C":2}},
                    {"from":9,"to":12,"cutoffs":{"A+":6,"A":5,"B+":4,"B":3,"C":2}},
                    {"from":13,"to":null,"cutoffs":{"A+":8,"A":6,"B+":5,"B":4,"C":2}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":12,"A":10.5,"B+":9,"B":7.5,"C":6,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "385b03f8",
              "name": "Sit-up (20 sec)",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "count",
                  "direction": "at_least",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":18,"A":16,"B+":11,"B":6,"C":4}},
                    {"from":9,"to":12,"cutoffs":{"A+":20,"A":18,"B+":15,"B":10,"C":4}},
                    {"from":13,"to":null,"cutoffs":{"A+":23,"A":20,"B+":18,"B":15,"C":6}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "02d4e8c2",
              "name": "Push-up (1 min)",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "count",
                  "direction": "at_least",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":20,"A":18,"B+":16,"B":14,"C":12}},
                    {"from":9,"to":12,"cutoffs":{"A+":36,"A":30,"B+":25,"B":20,"C":15}},
                    {"from":13,"to":null,"cutoffs":{"A+":50,"A":40,"B+":30,"B":25,"C":20}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "b0574466",
              "name": "Static jump",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "inches",
                  "direction": "at_least",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":12,"A":10,"B+":9,"B":7,"C":3}},
                    {"from":9,"to":12,"cutoffs":{"A+":18,"A":15,"B+":13,"B":10,"C":5}},
                    {"from":13,"to":null,"cutoffs":{"A+":23,"A":20,"B+":18,"B":15,"C":10}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "091d987a",
              "name": "Long jump",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "inches (feet x 12 + inches)",
                  "direction": "at_least",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":72,"A":60,"B+":54,"B":48,"C":36}},
                    {"from":9,"to":12,"cutoffs":{"A+":84,"A":72,"B+":66,"B":60,"C":48}},
                    {"from":13,"to":null,"cutoffs":{"A+":96,"A":84,"B+":78,"B":72,"C":60}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "429987ca",
              "name": "Sprint 4x10 m",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "seconds",
                  "direction": "at_most",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":10,"A":12,"B+":13,"B":14,"C":16}},
                    {"from":9,"to":12,"cutoffs":{"A+":9,"A":11,"B+":12,"B":13,"C":15}},
                    {"from":13,"to":null,"cutoffs":{"A+":8,"A":10,"B+":11,"B":12,"C":14}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "c456d1fc",
              "name": "Pull-up or hold",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": "Pull-up",
                  "unit": "reps",
                  "direction": "at_least",
                  "brackets": [
                    {"from":null,"to":12,"cutoffs":{"A+":6,"A":5,"B+":3,"B":2,"C":1}},
                    {"from":13,"to":null,"cutoffs":{"A+":10,"A":8,"B+":6,"B":4,"C":2}}
                  ]
                },
                {
                  "name": "Hold",
                  "unit": "seconds",
                  "direction": "at_least",
                  "brackets": [{"from":null,"to":null,"cutoffs":{"A+":31,"A":26,"B+":21,"B":11,"C":9}}]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": true,
              "handed_in": false,
              "note": null
            },
            {
              "id": "fac2fc81",
              "name": "Sprint 100 m",
              "credits": 2,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "seconds",
                  "direction": "under",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":18,"A":20,"B+":22,"B":24,"C":28}},
                    {"from":9,"to":12,"cutoffs":{"A+":15,"A":17,"B+":19,"B":21,"C":24}},
                    {"from":13,"to":null,"cutoffs":{"A+":14,"A":15,"B+":16,"B":17,"C":23}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":8,"A":7,"B+":6,"B":5,"C":4,"D":0},
              "limited_to": null,
              "outdoor": true,
              "handed_in": false,
              "note": null
            },
            {
              "id": "5f186262",
              "name": "1/2 or 1 mile",
              "credits": 3,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "minutes",
                  "direction": "at_most",
                  "brackets": [
                    {"from":null,"to":8,"cutoffs":{"A+":5,"A":6,"B+":6.5,"B":7,"C":8}},
                    {"from":9,"to":12,"cutoffs":{"A+":4,"A":5,"B+":5.5,"B":6,"C":7}},
                    {"from":13,"to":null,"cutoffs":{"A+":8,"A":8.5,"B+":9,"B":11,"C":12}}
                  ]
                }
              ],
              "points_mode": "worked",
              "points": {"A+":12,"A":10.5,"B+":9,"B":7.5,"C":6,"D":0},
              "limited_to": null,
              "outdoor": true,
              "handed_in": false,
              "note": "1/2 mile for 12 and under, 1 mile for 13 and over"
            }
          ]
        },
        {
          "code": "technical",
          "name": "Technical",
          "grade_points": {"A+":4,"A":3.5,"A-":3.25,"B+":3,"B":2.5,"B-":2.25,"C":2,"C-":1,"D":0},
          "subjects": [
            {
              "id": "ff410974",
              "name": "Referee seminar",
              "credits": 10,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":40,"A":35,"A-":32.5,"B+":30,"B":25,"B-":22.5,"C":20,"C-":10,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "ed7137f5",
              "name": "Free sparring",
              "credits": 4,
              "scoring": "graded",
              "ways": [],
              "points_mode": "own",
              "points": {"A+":16,"A":14,"A-":13,"B+":12,"B":9,"B-":8.5,"C":8,"C-":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "08bf6910",
              "name": "Target kick (30 sec)",
              "credits": 4,
              "scoring": "measured",
              "ways": [
                {
                  "name": null,
                  "unit": "kicks in 30 seconds",
                  "direction": "at_least",
                  "brackets": [
                    {"from":null,"to":9,"cutoffs":{"A+":35,"A":31,"B+":26,"B":22,"C":21}},
                    {"from":10,"to":null,"cutoffs":{"A+":39,"A":34,"B+":29,"B":24,"C":23}}
                  ]
                }
              ],
              "points_mode": "own",
              "points": {"A+":16,"A":14,"B+":12,"B":9,"C":8,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "f7656496",
              "name": "Korean terminology",
              "credits": 4,
              "scoring": "graded",
              "ways": [],
              "points_mode": "own",
              "points": {"A+":16,"A":14,"A-":13,"B+":12,"B":9,"B-":8.5,"C":8,"C-":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "fc23ec3c",
              "name": "TKD knowledge",
              "credits": 4,
              "scoring": "graded",
              "ways": [],
              "points_mode": "own",
              "points": {"A+":16,"A":14,"A-":13,"B+":12,"B":9,"B-":8.5,"C":8,"C-":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "2e77f7d2",
              "name": "Written test",
              "credits": 10,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":40,"A":35,"A-":32.5,"B+":30,"B":25,"B-":22.5,"C":20,"C-":10,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            }
          ]
        },
        {
          "code": "curriculum",
          "name": "Curriculum",
          "grade_points": {"A+":4.5,"A":4,"A-":3.8,"B+":3.5,"B":3.3,"B-":3,"C":2.5,"C-":2,"D":0},
          "subjects": [
            {
              "id": "969ddf81",
              "name": "White-Bodan Curriculum",
              "credits": 10,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":45,"A":40,"A-":38,"B+":35,"B":33,"B-":30,"C":25,"C-":20,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "e78a74df",
              "name": "Tae Baek Poomsae",
              "credits": 4,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":18,"A":16,"A-":15.2,"B+":14,"B":13.2,"B-":12,"C":10,"C-":8,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "58165970",
              "name": "1st Dan Curriculum",
              "credits": 10,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":45,"A":40,"A-":38,"B+":35,"B":33,"B-":30,"C":25,"C-":20,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "bb52202a",
              "name": "2nd Dan Curriculum",
              "credits": 10,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":45,"A":40,"A-":38,"B+":35,"B":33,"B-":30,"C":25,"C-":20,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "cf2085ae",
              "name": "3rd Dan Sa Bang Chuck (1-6)",
              "credits": 4,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":18,"A":16,"A-":15.2,"B+":14,"B":13.2,"B-":12,"C":10,"C-":8,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "b5428a7b",
              "name": "Creative Poomsae",
              "credits": 4,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":18,"A":16,"A-":15.2,"B+":14,"B":13.2,"B-":12,"C":10,"C-":8,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "7f13b763",
              "name": "Creative Sa Bang Chuck",
              "credits": 4,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":18,"A":16,"A-":15.2,"B+":14,"B":13.2,"B-":12,"C":10,"C-":8,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "2fc03cd2",
              "name": "Technical Break",
              "credits": 4,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":18,"A":16,"A-":15.2,"B+":14,"B":13.2,"B-":12,"C":10,"C-":8,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "48868ae5",
              "name": "Power Break",
              "credits": 4,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":18,"A":16,"A-":15.2,"B+":14,"B":13.2,"B-":12,"C":10,"C-":8,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            }
          ]
        },
        {
          "code": "other",
          "name": "Other requirements",
          "grade_points": {"A+":4,"A":3.5,"A-":3.25,"B+":3,"B":2.5,"B-":2.25,"C":2,"C-":1,"D":0},
          "subjects": [
            {
              "id": "dd6acc66",
              "name": "Egg test",
              "credits": 4,
              "scoring": "graded",
              "ways": [],
              "points_mode": "own",
              "points": {"A+":16,"A":14,"A-":13,"B+":12,"B":9,"B-":8.5,"C":8,"C-":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": true,
              "note": null
            },
            {
              "id": "e74fd0a5",
              "name": "Meditation",
              "credits": 4,
              "scoring": "graded",
              "ways": [],
              "points_mode": "own",
              "points": {"A+":16,"A":14,"A-":13,"B+":12,"B":9,"B-":8.5,"C":8,"C-":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": true,
              "note": null
            },
            {
              "id": "7b1022de",
              "name": "Assistant instructor course",
              "credits": 10,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":40,"A":35,"A-":32.5,"B+":30,"B":25,"B-":22.5,"C":20,"C-":10,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": false,
              "note": null
            },
            {
              "id": "5f554fb5",
              "name": "Appreciation letter",
              "credits": 4,
              "scoring": "graded",
              "ways": [],
              "points_mode": "own",
              "points": {"A+":16,"A":14,"A-":13,"B+":12,"B":9,"B-":8.5,"C":8,"C-":4,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": true,
              "note": null
            },
            {
              "id": "2d1208c8",
              "name": "TKD project",
              "credits": 10,
              "scoring": "graded",
              "ways": [],
              "points_mode": "worked",
              "points": {"A+":40,"A":35,"A-":32.5,"B+":30,"B":25,"B-":22.5,"C":20,"C-":10,"D":0},
              "limited_to": null,
              "outdoor": false,
              "handed_in": true,
              "note": null
            }
          ]
        }
      ],
      "extra_points": {
        "counts_toward_total": true,
        "limit": null,
        "to_confirm": true,
        "note": "4th Dan uses the 3rd Dan numbers for now",
        "items": [
          {"name":"Extra stripes","rule":{"kind":"per_count","points_each":1}},
          {"name":"Outstanding performance","rule":{"kind":"steps","steps":[{"at_least":3,"points":5}]}},
          {
            "name": "Competitions",
            "rule": {
              "kind": "steps",
              "steps": [
                {"at_least":1,"points":3},
                {"at_least":2,"points":5},
                {"at_least":3,"points":7},
                {"at_least":4,"points":10},
                {"at_least":5,"points":15}
              ]
            }
          },
          {
            "name": "Attendance (classes)",
            "rule": {
              "kind": "steps",
              "steps": [{"at_least":210,"points":3},{"at_least":231,"points":5},{"at_least":250,"points":10}]
            }
          },
          {
            "name": "Special events",
            "rule": {
              "kind": "steps",
              "steps": [{"at_least":3,"points":3},{"at_least":6,"points":5},{"at_least":10,"points":10}]
            }
          },
          {
            "name": "Breaking class",
            "rule": {
              "kind": "steps",
              "steps": [{"at_least":11,"points":3},{"at_least":17,"points":5},{"at_least":21,"points":10}]
            }
          }
        ]
      }
    }
  ]
};

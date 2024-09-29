import { describe, it } from "node:test"
import {
    False,
    True,
    bytes,
    compileForRun,
    constr,
    int,
    list,
    map
} from "./utils.js"
import { encodeUtf8 } from "@helios-lang/codec-utils"

function getLine(stackOffset) {
    var stack = new Error().stack.split("\n"),
        line = stack[(stackOffset || 1) + 1].split(":")
    return parseInt(line[line.length - 2], 10)
}

Object.defineProperty(global, "__line", {
    get: function () {
        return getLine(2)
    }
})
describe("Singleton", () => {
    describe("Singleton(Int)::is_valid_data", () => {
        const runner = compileForRun(`testing singleton_int_is_valid_data
        struct S {
            a: Int
        }

        func main(d: Data) -> Bool {
            S::is_valid_data(d)
        }`)

        it("returns true for iData", () => {
            runner([int(0)], True)
        })

        it("returns false for bData", () => {
            runner([bytes([])], False)
        })

        it("returns false for listData", () => {
            runner([list()], False)
        })

        it("returns false for mapData", () => {
            runner([map([])], False)
        })

        it("returns false for constrData", () => {
            runner([constr(1)], False)
        })
    })
})

describe("Pair[Int, Int]", () => {
    describe("Pair[Int, Int]::is_valid_data", () => {
        const runner = compileForRun(`testing pair_int_int_is_valid_data
        struct S {
            a: Int
            b: Int
        }

        func main(d: Data) -> Bool {
            S::is_valid_data(d)
        }`)

        it("returns true for list with two iData items", () => {
            runner([list(int(0), int(1))], True)
        })

        it("returns false for list with three iData items", () => {
            runner([list(int(0), int(1), int(2))], False)
        })

        it("returns false for list with one iData item", () => {
            runner([list(int(0))], False)
        })

        it("returns false for iData", () => {
            runner([int(0)], False)
        })

        it("returns false for bData", () => {
            runner([bytes([])], False)
        })

        it("returns false for listData", () => {
            runner([list()], False)
        })

        it("returns false for mapData", () => {
            runner([map([])], False)
        })

        it("returns false for constrData", () => {
            runner([constr(1)], False)
        })
    })
})

describe("Cip68 Pair[Int, Int]", () => {
    describe("Pair[Int, Int]::is_valid_data", () => {
        const runner = compileForRun(`testing pair_int_int_is_valid_data
        struct S {
            a: Int "a"
            b: Int "b"
        }

        func main(d: Data) -> Bool {
            S::is_valid_data(d)
        }`)

        it("returns true for constrData with tag 0 and one field containing the map", () => {
            runner(
                [
                    constr(
                        0,
                        map([
                            [bytes(encodeUtf8("a")), int(0)],
                            [bytes(encodeUtf8("b")), int(1)]
                        ])
                    )
                ],
                True
            )
        })

        it("returns false if one of the fields isn't iData", () => {
            runner(
                [
                    constr(
                        0,
                        map([
                            [bytes(encodeUtf8("a")), int(0)],
                            [bytes(encodeUtf8("b")), bytes([])]
                        ])
                    )
                ],
                False
            )
        })

        it("returns false if one of the fields is missing", () => {
            runner([constr(0, map([[bytes(encodeUtf8("a")), int(0)]]))], False)
        })

        it("returns true even if an unknown field is included", () => {
            runner(
                [
                    constr(
                        0,
                        map([
                            [bytes(encodeUtf8("b")), int(1)],
                            [bytes(encodeUtf8("a")), int(0)],
                            [bytes(encodeUtf8("c")), int(2)]
                        ])
                    )
                ],
                True
            )
        })

        it("returns false for list", () => {
            runner([list()], False)
        })

        it("returns false for iData", () => {
            runner([int(0)], False)
        })

        it("returns false for bData", () => {
            runner([bytes([])], False)
        })

        it("returns false for listData", () => {
            runner([list()], False)
        })

        it("returns false for mapData", () => {
            runner([map([])], False)
        })

        it("returns false for constrData with tag 1", () => {
            runner([constr(1)], False)
        })
    })

    describe("Cip68 Pair[Int, Int] == Pair", () => {
        const runner = compileForRun(`testing mStruct_pair_equals
        struct Pair {
            a: Int "a"
            b: Int "b"
        }
        func main(a: Int, b: Int, c: Data) -> Bool {
            Pair{a, b} == Pair::from_data(c)
        }`)

        it("returns true if the order of the fields is the same", () => {
            runner(
                [
                    int(0),
                    int(1),
                    constr(
                        0,
                        map([
                            [bytes(encodeUtf8("a")), int(0)],
                            [bytes(encodeUtf8("b")), int(1)]
                        ])
                    )
                ],
                True
            )
        })

        it("returns true if the order of the fields is different", () => {
            runner(
                [
                    int(0),
                    int(1),
                    constr(
                        0,
                        map([
                            [bytes(encodeUtf8("b")), int(1)],
                            [bytes(encodeUtf8("a")), int(0)]
                        ])
                    )
                ],
                True
            )
        })

        it("returns true if the second pair has additional entries", () => {
            runner(
                [
                    int(0),
                    int(1),
                    constr(
                        0,
                        map([
                            [bytes(encodeUtf8("b")), int(1)],
                            [bytes(encodeUtf8("a")), int(0)],
                            [bytes(encodeUtf8("c")), bytes([])]
                        ])
                    )
                ],
                True
            )
        })

        it("returns false if an entry doesn't match", () => {
            runner(
                [
                    int(0),
                    int(1),
                    constr(
                        0,
                        map([
                            [bytes(encodeUtf8("b")), int(1)],
                            [bytes(encodeUtf8("a")), int(1)]
                        ])
                    )
                ],
                False
            )
        })
        it("throws an error if the second pair is missing an entry", () => {
            runner(
                [
                    int(0),
                    int(1),
                    constr(
                        0,
                        map([
                            [bytes(encodeUtf8("b")), int(1)],
                            [bytes(encodeUtf8("a_")), int(0)]
                        ])
                    )
                ],
                { error: "" }
            )
        })
    })

    describe("Cip68 Pair[Int, Int] != Pair", () => {
        const runner = compileForRun(`testing mStruct_pair_neq
        struct Pair {
            a: Int "a"
            b: Int "b"
        }
        func main(a: Int, b: Int, c: Data) -> Bool {
            Pair{a, b} != Pair::from_data(c)
        }`)

        it("returns true if the order of the fields is the same and one entry differs", () => {
            runner(
                [
                    int(0),
                    int(1),
                    constr(
                        0,
                        map([
                            [bytes(encodeUtf8("a")), int(0)],
                            [bytes(encodeUtf8("b")), int(2)]
                        ])
                    )
                ],
                True
            )
        })

        it("returns false if the order of the fields is the same and all entries are the same", () => {
            runner(
                [
                    int(0),
                    int(1),
                    constr(
                        0,
                        map([
                            [bytes(encodeUtf8("a")), int(0)],
                            [bytes(encodeUtf8("b")), int(1)]
                        ])
                    )
                ],
                False
            )
        })

        it("returns true if the order of the fields is different and one entry differs", () => {
            runner(
                [
                    int(0),
                    int(1),
                    constr(
                        0,
                        map([
                            [bytes(encodeUtf8("b")), int(2)],
                            [bytes(encodeUtf8("a")), int(0)]
                        ])
                    )
                ],
                True
            )
        })

        it("returns false if the order of the fields is different and all entries are the same", () => {
            runner(
                [
                    int(0),
                    int(1),
                    constr(
                        0,
                        map([
                            [bytes(encodeUtf8("b")), int(1)],
                            [bytes(encodeUtf8("a")), int(0)]
                        ])
                    )
                ],
                False
            )
        })

        it("returns true if the second pair has additional entries and one entry differs", () => {
            runner(
                [
                    int(0),
                    int(1),
                    constr(
                        0,
                        map([
                            [bytes(encodeUtf8("b")), int(2)],
                            [bytes(encodeUtf8("a")), int(0)],
                            [bytes(encodeUtf8("c")), bytes([])]
                        ])
                    )
                ],
                True
            )
        })

        it("returns false if the second pair has additional entries and but all other entries are the same", () => {
            runner(
                [
                    int(0),
                    int(1),
                    constr(
                        0,
                        map([
                            [bytes(encodeUtf8("b")), int(1)],
                            [bytes(encodeUtf8("a")), int(0)],
                            [bytes(encodeUtf8("c")), bytes([])]
                        ])
                    )
                ],
                False
            )
        })

        it("throws an error if the second pair is missing an entry", () => {
            runner(
                [
                    int(0),
                    int(1),
                    constr(
                        0,
                        map([
                            [bytes(encodeUtf8("b")), int(1)],
                            [bytes(encodeUtf8("a_")), int(0)]
                        ])
                    )
                ],
                { error: "" }
            )
        })
    })
})

// this space intentionally left blank.  See below.
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//hack hack hack.
const anchorLine = __line // arrange this to be on an even line number (e.g. 500) to ease troubleshooting
const longExample = `testing mStruct_encodings  //$$anchorLine: ${anchorLine}
    struct ExampleCip68Meta {
        name: String "name" // required by Cip68
        description: String // can't be "desc" or anything shorter because Cip68 requires "description".
        url: String // allowed by Cip68
        
        merit: Int  // allowed by extensibility rule of Cip68
    }
        
    struct SomethingElseStringMapped {
        // field names here don't need to follow Cip68 rules
        longFieldName: String "sfn"
        f2: String
    }

    enum Datum {
        StrictCip68 { 
            data: ExampleCip68Meta
            version: Int  // 2
            extra : Data
        }
        LooseCip68 { data: ExampleCip68Meta }
        nonCip68 {
            someIntField: Int
            smap: SomethingElseStringMapped
        }
    }

    func main(d: Data) -> Datum {
        print("hi there!");
        assert(Datum::is_valid_data(d), "invalid data");
        Datum::from_data(d)
    }`

// !!! todo: some tests for Cip68 struct in an enum variant (e.g. Datum)
// and outside such a variant.  When the wrapper is eaten by the enum,
// the raw struct should work.
// When such an item is encoded outside the enum, the wrapper created
// for that context should be tolerated fine by the on-chain code.

describe("string-mapped struct encoding", () => {
    const runner = compileForRun(longExample)
    describe("when in a Datum enum variant (Cip68 context)", () => {
        it("reads and writes Cip68-formatted data", () => {
            runner(
                [
                    // types.Datum({
                    //     StrictCip68: {
                    //         data: types.myCip68Meta,
                    //         version: types.Int,
                    //         extra: types.Data
                    //     }
                    // })
                    constr(
                        0n,
                        // constr(0n, //  XXX we don't want the extra wrapper
                        map([
                            [
                                bytes(encodeUtf8("name")),
                                bytes(encodeUtf8("foo"))
                            ],
                            [
                                bytes(encodeUtf8("description")),
                                bytes(encodeUtf8("bar"))
                            ],
                            [
                                bytes(encodeUtf8("url")),
                                bytes(encodeUtf8("https://example.com"))
                            ],
                            [bytes(encodeUtf8("merit")), int(1)]
                        ]) // ) // XXX
                    ),
                    int(2),
                    bytes(encodeUtf8("extra"))
                ],
                True
            )
        })
        it("b", () => {})
    })
    describe("when used in a different position not relevant to Cip68", () => {
        it("reads and writes Map[String]Data according to the struct definition", () => {
            // todo            
        })
    })
})

import { describe, it, expect } from "vitest";
import {
  splitWords,
  camelCase,
  pascalCase,
  snakeCase,
  kebabCase,
  constantCase,
  titleCase,
  sentenceCase,
  lowerCase,
  upperCase,
  slug,
} from "./case-converter";

describe("splitWords", () => {
  it("splits mixed styles", () => {
    expect(splitWords("fooBar_baz-qux  quux")).toEqual(["foo", "Bar", "baz", "qux", "quux"]);
    expect(splitWords("XMLHttpRequest")).toEqual(["XML", "Http", "Request"]);
    expect(splitWords("version2Beta")).toEqual(["version2", "Beta"]);
  });

  it("returns empty for no words", () => {
    expect(splitWords("  --  ")).toEqual([]);
  });
});

describe("conversions", () => {
  const src = "hello big_World-of XMLParser";
  it("camel", () => expect(camelCase(src)).toBe("helloBigWorldOfXmlParser"));
  it("pascal", () => expect(pascalCase(src)).toBe("HelloBigWorldOfXmlParser"));
  it("snake", () => expect(snakeCase(src)).toBe("hello_big_world_of_xml_parser"));
  it("kebab", () => expect(kebabCase(src)).toBe("hello-big-world-of-xml-parser"));
  it("constant", () => expect(constantCase(src)).toBe("HELLO_BIG_WORLD_OF_XML_PARSER"));
  it("title", () => expect(titleCase("hello_world")).toBe("Hello World"));
  it("sentence", () => expect(sentenceCase("helloBigWorld")).toBe("Hello big world"));
  it("lower/upper", () => {
    expect(lowerCase("Ab C")).toBe("ab c");
    expect(upperCase("Ab C")).toBe("AB C");
  });
  it("empty input", () => {
    expect(camelCase("")).toBe("");
    expect(sentenceCase("")).toBe("");
  });
});

describe("slug", () => {
  it("removes diacritics and punctuation", () => {
    expect(slug("  Héllo, Wörld! It's 2024 ")).toBe("hello-world-it-s-2024");
  });
});

import { describe, expect, it } from "bun:test";
import { effectiveRules } from "../resolve";
import type { HosterModel, RedirectRule } from "../../types/hoster";
import type { HosterOverride } from "../../types/global";

describe("effectiveRules", () => {
  const mockModel = {
    id: "test_host",
    defaultRedirectRules: [
      {
        id: "rule1",
        description: "Rule 1",
        enabled: true,
        pattern: "^https://test\\.com/p/(.+)$",
        template: "https://test.com/img/$1.jpg",
      },
      {
        id: "rule2",
        description: "Rule 2",
        enabled: false, // Default is disabled
        pattern: "^https://test\\.com/old/(.+)$",
        template: "https://test.com/new/$1",
      },
    ] as RedirectRule[],
  } as unknown as HosterModel;

  it("returns default enabled rules when override has no redirectRules", () => {
    const override: HosterOverride = {
      enabled: true,
      redirectRules: null, // User has not customized rules
      cssOverrides: "",
    };

    const rules = effectiveRules(mockModel, override);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.pattern).toBe("^https://test\\.com/p/(.+)$");
  });

  it("returns user rules when override has redirectRules, filtering out disabled ones", () => {
    const override: HosterOverride = {
      enabled: true,
      redirectRules: [
        {
          id: "custom1",
          description: "Custom 1",
          enabled: true,
          pattern: "^https://custom\\.com/(.+)$",
          template: "https://custom.com/image/$1",
        },
        {
          id: "disabled1",
          description: "Disabled 1",
          enabled: false,
          pattern: "^https://disabled\\.com/(.+)$",
          template: "https://disabled.com/$1",
        },
      ],
      cssOverrides: "",
    };

    const rules = effectiveRules(mockModel, override);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.pattern).toBe("^https://custom\\.com/(.+)$");
  });

  it("returns an empty array if all default rules are disabled", () => {
    const allDisabledModel = {
      ...mockModel,
      defaultRedirectRules: [
        { id: "x", description: "x", enabled: false, pattern: ".*", template: "" },
      ],
    } as unknown as HosterModel;

    const override: HosterOverride = { enabled: true, redirectRules: null, cssOverrides: "" };
    const rules = effectiveRules(allDisabledModel, override);
    expect(rules).toHaveLength(0);
  });

  it("returns an empty array if all override rules are disabled", () => {
    const override: HosterOverride = {
      enabled: true,
      redirectRules: [
        { id: "1", description: "1", enabled: false, pattern: "1", template: "1" },
        { id: "2", description: "2", enabled: false, pattern: "2", template: "2" },
      ],
      cssOverrides: "",
    };
    const rules = effectiveRules(mockModel, override);
    expect(rules).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";
import { classifyCashFlowCategory, pickCounterLine, type CashFlowAccount } from "./cash-flow-category";

const acc = (id: string, account_code: string, account_type: string, account_subtype: string | null = null): CashFlowAccount => ({
  id,
  account_code,
  account_type,
  account_subtype,
});

const KAS = acc("kas", "1-1001", "Aset", "Aset Lancar");
const BANK = acc("bank", "1-1002", "Aset", "Aset Lancar");
const PERALATAN = acc("alat", "1-2001", "Aset", "Aset Tetap");
const HUTANG_USAHA = acc("hutang", "2-1000", "Kewajiban");
const UTANG_INVESTOR = acc("investor", "2-1300", "Kewajiban");
const MODAL = acc("modal", "3-1000", "Modal");
const PENDAPATAN = acc("pendapatan", "4-1000", "Pendapatan");
const BEBAN = acc("beban", "5-1004", "Beban");
const CASH = [KAS.id, BANK.id];
const byId = new Map([KAS, BANK, PERALATAN, HUTANG_USAHA, UTANG_INVESTOR, MODAL, PENDAPATAN, BEBAN].map((a) => [a.id, a]));

describe("classifyCashFlowCategory", () => {
  it("aset tetap = Investasi", () => expect(classifyCashFlowCategory(PERALATAN, CASH)).toBe("Investasi"));
  it("modal pemilik = Pendanaan", () => expect(classifyCashFlowCategory(MODAL, CASH)).toBe("Pendanaan"));
  it("dana investor 2-1300 = Pendanaan walau tipenya Kewajiban", () =>
    expect(classifyCashFlowCategory(UTANG_INVESTOR, CASH)).toBe("Pendanaan"));
  it("hutang usaha, pendapatan, beban = Operasional", () => {
    expect(classifyCashFlowCategory(HUTANG_USAHA, CASH)).toBe("Operasional");
    expect(classifyCashFlowCategory(PENDAPATAN, CASH)).toBe("Operasional");
    expect(classifyCashFlowCategory(BEBAN, CASH)).toBe("Operasional");
  });
  it("transfer Kas <-> Bank dan tanpa akun lawan = Lainnya", () => {
    expect(classifyCashFlowCategory(BANK, CASH)).toBe("Lainnya");
    expect(classifyCashFlowCategory(undefined, CASH)).toBe("Lainnya");
  });
});

describe("pickCounterLine", () => {
  it("jurnal 2 baris: baris non-kas", () => {
    const lines = [
      { account_id: "bank", debit: 0, credit: 500 },
      { account_id: "beban", debit: 500, credit: 0 },
    ];
    expect(pickCounterLine(lines, CASH, byId)?.account_id).toBe("beban");
  });

  it("jurnal multi-baris: nominal terbesar menang, apa pun urutannya", () => {
    const lines = [
      { account_id: "hutang", debit: 0, credit: 4_000_000 },
      { account_id: "alat", debit: 10_000_000, credit: 0 },
      { account_id: "bank", debit: 0, credit: 6_000_000 },
    ];
    expect(pickCounterLine(lines, CASH, byId)?.account_id).toBe("alat");
    expect(pickCounterLine([...lines].reverse(), CASH, byId)?.account_id).toBe("alat");
  });

  it("nominal sama: kode akun terkecil (stabil)", () => {
    const lines = [
      { account_id: "pendapatan", debit: 0, credit: 300 },
      { account_id: "modal", debit: 0, credit: 300 },
      { account_id: "kas", debit: 600, credit: 0 },
    ];
    expect(pickCounterLine(lines, CASH, byId)?.account_id).toBe("modal");
    expect(pickCounterLine([...lines].reverse(), CASH, byId)?.account_id).toBe("modal");
  });

  it("hanya baris kas (transfer internal) = tidak ada akun lawan", () => {
    const lines = [
      { account_id: "kas", debit: 100, credit: 0 },
      { account_id: "bank", debit: 0, credit: 100 },
    ];
    expect(pickCounterLine(lines, CASH, byId)).toBeUndefined();
  });
});

import { CgMessage, CgType } from "../src/CgProto";

var base = new CgMessage({type: CgType.ack, client_id: 0, group: "any group"})
test("CgMessage.constructor", () => {
  expect(base).toBeInstanceOf(CgMessage)
})
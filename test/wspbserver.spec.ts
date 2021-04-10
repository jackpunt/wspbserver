import { CnxManager, WSSOpts } from "../src/wspbserver";
import { EchoServer } from "../src/echoserver";
const moment = require('moment');

const theGraid: WSSOpts = {
	domain: ".thegraid.com",
	port: 8443,
	keydir: "/Users/jpeck/keys/"
}
class TestEcho extends EchoServer {
  msgCount: number = 0;
  onerror(reason: Event) {
    super.onerror(reason)
    TestCnxManager.errorFunc(reason)
  }
  wsmessage(buf: Buffer) {
    super.wsmessage(buf)
    this.msgCount += 1
    if (this.msgCount >= 3)
      setTimeout(() => {
        TestCnxManager.doneFunc("count")
        setTimeout(() => process.exit(2), 2000)
        // would be nice to just terminate the '.on' listeners so process exit normally.
      }, 2000)
  }
  onclose(ev: Event) {
    super.onclose(ev)
    TestCnxManager.doneFunc("closed")
  }
}
class TestCnxManager extends CnxManager {
  static doneFunc: (data: string) => void;
  static errorFunc: (resaon: any) => void;

  runOnce(): Promise<string> {
    let donePromise = new Promise<string>((resolve, err) => {
      TestCnxManager.doneFunc = resolve;
      TestCnxManager.errorFunc = err;
    })
    super.run()
    return donePromise;
  }
}

test("const", () => {
  expect(Object.entries(theGraid).length).toEqual(3);
})
const fmt = "YYYY-MM-DD kk:mm:ss.SS"

console.log("TestCnxManager! ", moment().format(fmt))
test("wait", async () => {
  // "await" appends: .then((data) => {expect(data)...})
  const data = await new TestCnxManager("game7", theGraid, TestEcho).runOnce();
  expect(data).toBe("count");
}, 30000)

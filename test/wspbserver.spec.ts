import { CnxManager, WSSOpts, EchoServer } from "../src/wspbserver";


const theGraid: WSSOpts = {
	domain: ".thegraid.com",
	port: 8443,
	keydir: "/Users/jpeck/keys/"
}
class TestEcho extends EchoServer {
  msgCount: number = 0;
  error(reason: any) {
    super.error(reason)
    TestCnxManager.errorFunc(reason)
  }
  message(buf: Buffer, flags: any) {
    super.message(buf, flags)
    this.msgCount += 1
    if (this.msgCount >= 3)
      setTimeout(() => {
        TestCnxManager.doneFunc("count")
        setTimeout(() => process.exit(2), 300)
        // would be nice to just terminate the '.on' listeners so process exit normally.
      }, 500)
  }
  close() {
    super.close()
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
console.log("game-server! ", new Date().toTimeString())
test("wait", () => {
  return new TestCnxManager("game7", theGraid, TestEcho).runOnce().then(data=>{
    expect(data).toBe("count")
  })
}, 30000)

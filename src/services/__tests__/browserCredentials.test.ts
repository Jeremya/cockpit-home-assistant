import { Credentials } from "../credentials";
import { memoryStorage } from "../credentialStorage.web";

test("browser credentials use the common journal but do not survive a new page", async () => {
  const credentials = new Credentials(
    memoryStorage(),
    memoryStorage(),
    () => "page-id",
  );
  const settings = {
    url: "https://home.example.com",
    token: "test-secret",
    allowInsecureHttp: false,
  };
  await credentials.save(settings);
  expect(await credentials.load()).toEqual(settings);
  const reloaded = new Credentials(
    memoryStorage(),
    memoryStorage(),
    () => "new-page-id",
  );
  expect(await reloaded.load()).toBeNull();
  await credentials.forget(settings.url);
  expect(await credentials.load()).toBeNull();
});

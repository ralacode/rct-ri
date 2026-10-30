// 院内端末向けの「データが変わった」通知。実データは載せない。

use std::sync::OnceLock;
use tokio::sync::broadcast;

static BUS: OnceLock<broadcast::Sender<&'static str>> = OnceLock::new();

fn sender() -> &'static broadcast::Sender<&'static str> {
    BUS.get_or_init(|| {
        let (tx, _rx) = broadcast::channel(32);
        tx
    })
}

pub fn subscribe() -> broadcast::Receiver<&'static str> {
    sender().subscribe()
}

pub fn notify() {
    let _ = sender().send("changed");
}

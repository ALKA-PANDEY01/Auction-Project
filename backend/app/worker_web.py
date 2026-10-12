import asyncio
import logging
from contextlib import asynccontextmanager

from arq.worker import create_worker
from fastapi import FastAPI, HTTPException, Request

from app.worker import WorkerSettings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    ready = asyncio.Event()

    async def mark_ready(ctx):
        ready.set()

    worker = create_worker(
        WorkerSettings,
        handle_signals=False,
        on_startup=mark_ready,
    )
    worker_task = asyncio.create_task(worker.async_run(), name="arq-worker")
    ready_task = asyncio.create_task(ready.wait(), name="arq-ready")
    app.state.worker_task = worker_task

    try:
        done, _ = await asyncio.wait(
            {worker_task, ready_task},
            timeout=30,
            return_when=asyncio.FIRST_COMPLETED,
        )
        if worker_task in done:
            await worker_task
            raise RuntimeError("ARQ worker exited before becoming ready")
        if ready_task not in done:
            raise TimeoutError("ARQ worker did not become ready within 30 seconds")

        yield
    finally:
        ready_task.cancel()
        if not worker_task.done():
            worker_task.cancel()
        try:
            await worker_task
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("ARQ worker stopped with an error")
        await worker.close()


app = FastAPI(title="Auction Worker Health", lifespan=lifespan)


@app.get("/health")
async def health(request: Request):
    worker_task = request.app.state.worker_task
    if worker_task.done():
        if not worker_task.cancelled():
            worker_task.exception()
        raise HTTPException(status_code=503, detail="ARQ worker is not running")
    return {"status": "healthy", "worker": "running"}

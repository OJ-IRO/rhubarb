import { Board } from "./Board";
import { Honeycomb } from "./Honeycomb";

/**
 * Everything about what you're learning, on one page: what's waiting for a yes, and the plans
 * you've taken on with how far along each one is. (Once the board and the honeycomb.)
 */
export function Learning() {
  return (
    <div className="learning">
      <h1 className="title">Learning</h1>
      <p className="muted lead">
        What your days suggest you learn, and how far along you are. Say yes or no to what's waiting. Anything you ask for out loud, "Hey Rhubarb, teach me…", starts on its own.
      </p>
      <Board embedded />
      <section className="learning-progress">
        <Honeycomb embedded />
      </section>
    </div>
  );
}

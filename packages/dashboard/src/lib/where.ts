import { useEffect, useState } from "react";
import { api } from "../api";

/** Where Rhubarb's data lives: this computer, or a private server the wearer runs. Read once per page. */
export function useWhere(): { hosted: boolean; name: string } {
  const [where, setWhere] = useState<{ hosted: boolean; name: string }>({ hosted: false, name: "this computer" });
  useEffect(() => {
    let live = true;
    api
      .status()
      .then((s) => live && s.hosted && setWhere({ hosted: true, name: s.hosted.where }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return where;
}

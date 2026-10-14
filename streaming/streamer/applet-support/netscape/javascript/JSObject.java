package netscape.javascript;

import java.applet.Applet;
import java.util.HashMap;
import java.util.Map;

/**
 * Stand-in for the browser's LiveConnect bridge, which appletviewer lacks. The
 * window holds a document with a working cookie; calls into JavaScript do nothing.
 */
public class JSObject {
    private static JSObject window;

    private final Map<String, Object> members = new HashMap<String, Object>();

    protected JSObject() {
    }

    public static synchronized JSObject getWindow(Applet applet) throws JSException {
        if (window == null) {
            window = new JSObject();
            window.setMember("document", new Document());
        }
        return window;
    }

    public Object call(String methodName, Object[] args) throws JSException {
        return null;
    }

    public Object eval(String s) throws JSException {
        return null;
    }

    public Object getMember(String name) throws JSException {
        return members.get(name);
    }

    public void setMember(String name, Object value) throws JSException {
        members.put(name, value);
    }

    public void removeMember(String name) throws JSException {
        members.remove(name);
    }

    public Object getSlot(int index) throws JSException {
        return null;
    }

    public void setSlot(int index, Object value) throws JSException {
    }
}

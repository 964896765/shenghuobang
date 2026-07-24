import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { EmptyState, ErrorState, LoadingView } from "@/components/common";

type DiscoverStateViewProps =
  | {
      state: "loading";
      text: string;
    }
  | {
      state: "empty";
      title: string;
      hint: string;
      actionTitle?: string;
      onAction?: () => void;
    }
  | {
      state: "error";
      title: string;
      hint: string;
      onRetry: () => void;
    }
  | {
      state: "normal";
      children: ReactNode;
    };

export function DiscoverStateView(props: DiscoverStateViewProps) {
  if (props.state === "normal") return <>{props.children}</>;

  return (
    <View style={styles.container}>
      {props.state === "loading" ? (
        <LoadingView text={props.text} />
      ) : props.state === "empty" ? (
        <EmptyState
          title={props.title}
          hint={props.hint}
          actionTitle={props.actionTitle}
          onAction={props.onAction}
        />
      ) : (
        <ErrorState title={props.title} hint={props.hint} onRetry={props.onRetry} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
